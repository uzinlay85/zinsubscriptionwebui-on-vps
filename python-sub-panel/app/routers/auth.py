from fastapi import APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Setting
from app.schemas import LoginRequest
from typing import Dict, List
import os
import secrets
import time

router = APIRouter()

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "securepassword123")
AUTH_SECRET = os.getenv("AUTH_SECRET", "change_me")

# In-memory rate limiting: IP -> list of failed attempt timestamps
_FAILED_ATTEMPTS: Dict[str, List[float]] = {}
RATE_LIMIT_WINDOW = 300  # 5 minutes
MAX_FAILED_ATTEMPTS = 5

def timing_safe_compare(a: str, b: str) -> bool:
    return secrets.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def get_admin_credentials(db: Session):
    db_user = db.query(Setting).filter(Setting.key == "admin_username").first()
    db_pass = db.query(Setting).filter(Setting.key == "admin_password").first()
    
    username = db_user.value if (db_user and db_user.value) else ADMIN_USERNAME
    password = db_pass.value if (db_pass and db_pass.value) else ADMIN_PASSWORD
    return username, password

def check_rate_limit(ip: str):
    now = time.time()
    if ip in _FAILED_ATTEMPTS:
        # Keep only timestamps within window
        _FAILED_ATTEMPTS[ip] = [ts for ts in _FAILED_ATTEMPTS[ip] if now - ts < RATE_LIMIT_WINDOW]
        if len(_FAILED_ATTEMPTS[ip]) >= MAX_FAILED_ATTEMPTS:
            remaining = int(RATE_LIMIT_WINDOW - (now - _FAILED_ATTEMPTS[ip][0]))
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed login attempts. Account temporarily locked for {max(1, remaining)} seconds."
            )

def record_failed_attempt(ip: str):
    now = time.time()
    if ip not in _FAILED_ATTEMPTS:
        _FAILED_ATTEMPTS[ip] = []
    _FAILED_ATTEMPTS[ip].append(now)

def clear_failed_attempts(ip: str):
    _FAILED_ATTEMPTS.pop(ip, None)

# Server-side dynamic session token store: session_token -> created_timestamp
_ACTIVE_SESSIONS: Dict[str, float] = {}
SESSION_MAX_AGE = 7 * 24 * 60 * 60  # 7 days

def is_valid_session(token: str) -> bool:
    if not token:
        return False
    if token in _ACTIVE_SESSIONS:
        created = _ACTIVE_SESSIONS[token]
        if time.time() - created < SESSION_MAX_AGE:
            return True
        else:
            _ACTIVE_SESSIONS.pop(token, None)
            return False
    return False

def create_session() -> str:
    token = secrets.token_urlsafe(32)
    _ACTIVE_SESSIONS[token] = time.time()
    return token

def revoke_session(token: str):
    _ACTIVE_SESSIONS.pop(token, None)

@router.post("/login")
async def login(request: Request, response: Response, login_req: LoginRequest, db: Session = Depends(get_db)):
    client_ip = request.headers.get("x-forwarded-for") or (request.client.host if request.client else "unknown")
    if "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()
        
    check_rate_limit(client_ip)
    
    expected_user, expected_pass = get_admin_credentials(db)
    
    username_valid = timing_safe_compare(login_req.username, expected_user)
    password_valid = timing_safe_compare(login_req.password, expected_pass)
    
    if not (username_valid and password_valid):
        record_failed_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    clear_failed_attempts(client_ip)
    
    is_https = request.headers.get("x-forwarded-proto") == "https" or request.url.scheme == "https"
    session_token = create_session()
    
    resp = JSONResponse(content={"ok": True, "message": "Login successful"})
    resp.set_cookie(
        key="admin_auth",
        value=session_token,
        httponly=True,
        secure=is_https,
        samesite="lax",
        path="/",
        max_age=SESSION_MAX_AGE
    )
    return resp

@router.post("/logout")
async def logout(request: Request):
    token = request.cookies.get("admin_auth", "")
    if token:
        revoke_session(token)
    resp = JSONResponse(content={"ok": True, "message": "Logged out"})
    resp.delete_cookie(key="admin_auth", path="/")
    resp.delete_cookie(key="path_auth", path="/")
    return resp

@router.get("/logout")
async def logout_get(request: Request):
    token = request.cookies.get("admin_auth", "")
    if token:
        revoke_session(token)
    resp = RedirectResponse(url="/login", status_code=302)
    resp.delete_cookie(key="admin_auth", path="/")
    resp.delete_cookie(key="path_auth", path="/")
    return resp

