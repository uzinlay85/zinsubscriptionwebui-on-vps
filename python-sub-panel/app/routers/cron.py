from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Client, ClientKey, Server, Setting
from typing import Dict, Any
from datetime import datetime
import os
import json

router = APIRouter()

CRON_SECRET = os.getenv("CRON_SECRET", "change_me")

def check_auth(request: Request):
    auth_header = request.headers.get("authorization", "")
    query_secret = request.query_params.get("secret", "") or request.query_params.get("token", "")
    
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    elif query_secret:
        token = query_secret
    else:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    if token != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Invalid token")
    return True

@router.get("/sync-usage")
async def sync_usage(request: Request, db: Session = Depends(get_db)):
    check_auth(request)
    
    from app.services.vpn_manager import sync_all_usage
    await sync_all_usage(db)
    return {"ok": True}

@router.get("/check-expiry")
async def check_expiry(request: Request, db: Session = Depends(get_db)):
    check_auth(request)
    
    from app.services.vpn_manager import check_all_expiry
    await check_all_expiry(db)
    return {"ok": True}

@router.get("/auto-backup")
async def auto_backup(request: Request, db: Session = Depends(get_db)):
    check_auth(request)
    
    auto_backup_setting = db.query(Setting).filter(Setting.key == "auto_backup_enabled").first()
    if not auto_backup_setting or auto_backup_setting.value != "true":
        return {"ok": True, "skipped": True}
    
    webdav_url = db.query(Setting).filter(Setting.key == "webdav_url").first()
    webdav_username = db.query(Setting).filter(Setting.key == "webdav_username").first()
    webdav_password = db.query(Setting).filter(Setting.key == "webdav_password").first()
    
    if not all([webdav_url, webdav_username, webdav_password]):
        return {"ok": True, "skipped": True}
    
    from app.routers.backup import export_backup
    backup_data = await export_backup(db)
    
    filename = f"outline_panel_backup_{datetime.utcnow().strftime('%Y-%m-%d_%H%M%S')}.json"
    url = webdav_url.value.rstrip("/") + "/" + filename
    
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.put(
            url,
            data=json.dumps(backup_data).encode(),
            headers={"Content-Type": "application/json"},
            auth=aiohttp.BasicAuth(webdav_username.value, webdav_password.value),
            timeout=aiohttp.ClientTimeout(total=30),
            ssl=False
        ) as resp:
            if resp.status in [200, 201, 204]:
                return {"ok": True}
            else:
                raise HTTPException(status_code=500, detail="Backup failed")
    
    return {"ok": True}
