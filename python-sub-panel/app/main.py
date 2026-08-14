from fastapi import FastAPI, Request, Response, Cookie, HTTPException, Depends
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database import get_db, engine, Base
from app.models import Server, Client, ClientKey, Setting
from app.routers import auth, clients, servers, settings, backup, sub, cron
from app.tasks import start_scheduler
import os
import secrets
import time
from datetime import datetime

app = FastAPI(title="Unified VPN Subscription Panel")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

Base.metadata.create_all(bind=engine)

ADMIN_SECRET_PATH = os.getenv("ADMIN_SECRET_PATH", "")
AUTH_SECRET = os.getenv("AUTH_SECRET", "change_me")
APP_NAME = os.getenv("APP_NAME", "VPN Panel")
PANEL_NAME = os.getenv("PANEL_NAME", "VPN Panel")
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL_MINUTES", "10"))

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    
    public_paths = ["/api/sub/", "/health", "/static/", "/favicon.ico", "/login"]
    is_public = any(path.startswith(p) for p in public_paths)
    
    if is_public:
        return await call_next(request)
    
    if ADMIN_SECRET_PATH:
        path_auth = request.cookies.get("path_auth", "")
        if path_auth != "valid":
            if path == f"/{ADMIN_SECRET_PATH}":
                return await call_next(request)
            return RedirectResponse(url=f"/{ADMIN_SECRET_PATH}", status_code=302)
    
    admin_auth = request.cookies.get("admin_auth", "")
    if admin_auth != AUTH_SECRET:
        if path == f"/{ADMIN_SECRET_PATH}" and ADMIN_SECRET_PATH:
            return await call_next(request)
        return RedirectResponse(url="/login", status_code=302)
    
    if path == "/login" and admin_auth == AUTH_SECRET:
        return RedirectResponse(url="/", status_code=302)
    
    return await call_next(request)

@app.on_event("startup")
async def startup_event():
    start_scheduler(SYNC_INTERVAL)

@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

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

@app.get(f"/{ADMIN_SECRET_PATH}")
async def secret_path_entry(response: Response):
    if not ADMIN_SECRET_PATH:
        return RedirectResponse(url="/", status_code=302)
    response = RedirectResponse(url="/", status_code=302)
    response.set_cookie(key="path_auth", value="valid", httponly=True, max_age=86400)
    return response

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
