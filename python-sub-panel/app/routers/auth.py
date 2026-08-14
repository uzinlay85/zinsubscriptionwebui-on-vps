from fastapi import APIRouter, Request, Response, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Setting
from app.schemas import LoginRequest
import os
import secrets
import time

router = APIRouter()

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "securepassword123")
AUTH_SECRET = os.getenv("AUTH_SECRET", "change_me")

def timing_safe_compare(a: str, b: str) -> bool:
    return secrets.compare_digest(a.encode(), b.encode())

@router.post("/login")
async def login(request: Request, response: Response, login_req: LoginRequest, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    
    rate_limit_key = f"login_attempts:{client_ip}"
    now = int(time.time())
    
    # Simple in-memory rate limiting would require a global store
    # For now, just check credentials
    
    username_valid = timing_safe_compare(login_req.username, ADMIN_USERNAME)
    password_valid = timing_safe_compare(login_req.password, ADMIN_PASSWORD)
    
    if not (username_valid and password_valid):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    response = JSONResponse(content={"ok": True})
    response.set_cookie(
        key="admin_auth",
        value=AUTH_SECRET,
        httponly=True,
        secure=False,
        samesite="strict",
        max_age=7 * 24 * 60 * 60
    )
    return response

@router.post("/logout")
async def logout(response: Response):
    response = JSONResponse(content={"ok": True})
    response.delete_cookie(key="admin_auth")
    return response
