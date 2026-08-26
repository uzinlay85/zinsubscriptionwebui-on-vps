from fastapi import FastAPI, Request, Response, Cookie, HTTPException, Depends
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database import get_db, engine, Base, init_db
from app.models import Server, Client, ClientKey, Setting
from app.routers import auth, clients, servers, settings, backup, sub, cron
from app.tasks import start_scheduler
import os
import secrets
import time
from datetime import datetime, timezone

app = FastAPI(title="Unified VPN Subscription Panel")

ALLOWED_ORIGINS = [
    origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "").split(",") if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    # Same-origin requests do not require CORS. Only explicitly configured
    # origins may use credentialed cross-origin requests.
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=bool(ALLOWED_ORIGINS),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

init_db()

ADMIN_SECRET_PATH = os.getenv("ADMIN_SECRET_PATH", "")
AUTH_SECRET = os.getenv("AUTH_SECRET", "change_me")
APP_NAME = os.getenv("APP_NAME", "VPN Panel")
PANEL_NAME = os.getenv("PANEL_NAME", "VPN Panel")
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL_MINUTES", "10"))

@app.middleware("http")
async def security_and_auth_middleware(request: Request, call_next):
    path = request.url.path
    
    public_paths = [
        "/api/sub/", "/sub/", "/my/", "/api/cron/",
        "/health", "/static/", "/favicon.ico", "/login", "/logout",
        "/api/auth/login", "/api/auth/logout"
    ]
    is_public = any(path.startswith(p) for p in public_paths)
    
    if is_public:
        response = await call_next(request)
        # Apply OWASP Security Headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response
    
    if ADMIN_SECRET_PATH:
        path_auth = request.cookies.get("path_auth", "")
        if path_auth != "valid":
            if path == f"/{ADMIN_SECRET_PATH}":
                response = await call_next(request)
                return response
            return RedirectResponse(url=f"/{ADMIN_SECRET_PATH}", status_code=302)
    
    from app.routers.auth import is_valid_session
    admin_auth = request.cookies.get("admin_auth", "")
    if not is_valid_session(admin_auth):
        if ADMIN_SECRET_PATH and path == f"/{ADMIN_SECRET_PATH}":
            return await call_next(request)
        return RedirectResponse(url="/login", status_code=302)
    
    if path == "/login" and is_valid_session(admin_auth):
        return RedirectResponse(url="/", status_code=302)
    
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

@app.on_event("startup")
async def startup_event():
    start_scheduler(SYNC_INTERVAL)

@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/logout")
async def logout_redirect(request: Request):
    from app.routers.auth import revoke_session
    token = request.cookies.get("admin_auth", "")
    if token:
        revoke_session(token)
    resp = RedirectResponse(url="/login", status_code=302)
    resp.delete_cookie(key="admin_auth", path="/")
    resp.delete_cookie(key="path_auth", path="/")
    return resp

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "app_name": APP_NAME})

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request, db: Session = Depends(get_db)):
    servers_count = db.query(Server).count()
    clients_count = db.query(Client).count()
    keys_count = db.query(ClientKey).count()
    
    stats = [
        {"title": "Total Servers", "value": servers_count, "icon": "Server", "color": "text-blue-500", "bg": "bg-blue-500/10"},
        {"title": "Total Clients", "value": clients_count, "icon": "Users", "color": "text-purple-500", "bg": "bg-purple-500/10"},
        {"title": "Active Keys", "value": keys_count, "icon": "Key", "color": "text-emerald-500", "bg": "bg-emerald-500/10"},
    ]
    
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "app_name": APP_NAME,
        "stats": stats
    })

@app.get("/servers", response_class=HTMLResponse)
async def servers_page(request: Request):
    return templates.TemplateResponse("servers.html", {"request": request, "app_name": APP_NAME})

@app.get("/clients", response_class=HTMLResponse)
async def clients_page(request: Request):
    return templates.TemplateResponse("clients.html", {"request": request, "app_name": APP_NAME})

@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    return templates.TemplateResponse("settings.html", {"request": request, "app_name": APP_NAME})

@app.get("/my/{token}", response_class=HTMLResponse)
@app.get("/sub/view/{token}", response_class=HTMLResponse)
async def client_portal_page(request: Request, token: str, db: Session = Depends(get_db)):
    import urllib.parse
    import base64
    from app.routers import sub as sub_router
    
    client = db.query(Client).filter(Client.sub_token == token).first()
    if not client:
        raise HTTPException(status_code=404, detail="Subscription token not found")

    brand_name = sub_router.get_brand_name(db)
    
    # Calculate days left
    days_left = None
    exp_dt = sub_router.safe_parse_iso(client.expiry_date)
    if exp_dt:
        now = datetime.now(timezone.utc)
        if exp_dt.tzinfo is None:
            now = now.replace(tzinfo=None)
        days_left = (exp_dt - now).days

    # Usage calculation
    used_bytes = client.total_usage_bytes or 0
    used_gb = used_bytes / (1024 * 1024 * 1024)
    used_gb_str = f"{used_gb:.2f} GB"
    
    if client.data_limit_gb and client.data_limit_gb > 0:
        total_gb_str = f"{client.data_limit_gb} GB"
        usage_percent = min(100, int((used_gb / client.data_limit_gb) * 100))
    else:
        total_gb_str = "Unlimited"
        usage_percent = min(100, int((used_gb / 100) * 100)) if used_gb > 0 else 0

    # Build Public Sub URL respecting Nginx / Reverse Proxy headers
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if not host or "127.0.0.1" in host or "localhost" in host:
        host_header = request.headers.get("host")
        if host_header and "127.0.0.1" not in host_header and "localhost" not in host_header:
            host = host_header
        else:
            host = str(request.base_url).replace("http://", "").replace("https://", "").rstrip("/")
            
    base_url = f"{proto}://{host}".rstrip("/")
    sub_url = f"{base_url}/api/sub/{token}"
    short_sub_url = f"{base_url}/sub/{token}"
    
    sub_url_encoded = urllib.parse.quote(sub_url, safe="")
    sub_url_b64 = base64.b64encode(sub_url.encode()).decode()
    name_encoded = urllib.parse.quote(f"{client.name} - {brand_name}", safe="")

    # Get active nodes
    keys = db.query(ClientKey).filter(ClientKey.client_id == client.id).all()
    server_map = {s.id: s for s in db.query(Server).filter(Server.is_active != False).all()}
    
    from app.services.geo import get_flag_emoji
    node_list = []
    for k in keys:
        s = server_map.get(k.server_id)
        if s:
            flg = get_flag_emoji(s.country_code)
            node_list.append({
                "name": f"{flg} {s.name} - {client.name}",
                "type": s.type,
                "url": k.access_url,
                "flag_emoji": flg,
                "country_name": s.country_name or "Global"
            })

    return templates.TemplateResponse("portal.html", {
        "request": request,
        "client": client,
        "brand_name": brand_name,
        "days_left": days_left,
        "used_gb_str": used_gb_str,
        "total_gb_str": total_gb_str,
        "usage_percent": usage_percent,
        "sub_url": sub_url,
        "short_sub_url": short_sub_url,
        "sub_url_encoded": sub_url_encoded,
        "sub_url_b64": sub_url_b64,
        "name_encoded": name_encoded,
        "nodes": node_list,
        "current_year": datetime.now(timezone.utc).year
    })

@app.get("/sub/{token}")
async def short_sub_redirect(token: str):
    return RedirectResponse(url=f"/api/sub/{token}", status_code=307)

if ADMIN_SECRET_PATH:
    @app.get(f"/{ADMIN_SECRET_PATH}")
    async def secret_path_entry(response: Response):
        res = RedirectResponse(url="/", status_code=302)
        res.set_cookie(key="path_auth", value="valid", httponly=True, max_age=86400)
        return res

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(clients.router, prefix="/api/clients", tags=["clients"])
app.include_router(servers.router, prefix="/api/servers", tags=["servers"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(backup.router, prefix="/api/backup", tags=["backup"])
app.include_router(sub.router, prefix="/api/sub", tags=["subscription"])
app.include_router(cron.router, prefix="/api/cron", tags=["cron"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
