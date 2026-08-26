from fastapi import APIRouter, Request, HTTPException, Depends, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Server, Client, ClientKey, Setting
from app.schemas import BackupExportResponse
from typing import List, Dict, Any
import json
import os
from datetime import datetime, timezone
import aiohttp
import xml.etree.ElementTree as ET

router = APIRouter()

@router.get("/export", response_model=BackupExportResponse)
async def export_backup(db: Session = Depends(get_db)):
    servers = db.query(Server).all()
    clients = db.query(Client).all()
    client_keys = db.query(ClientKey).all()
    
    return {
        "version": "1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "servers": [
            {
                "id": s.id,
                "name": s.name,
                "api_url": s.api_url,
                "cert_sha256": s.cert_sha256,
                "created_at": s.created_at,
                "type": s.type,
                "auth_username": s.auth_username,
                "auth_password": s.auth_password,
                "username": s.username,
                "password": s.password,
                "inbound_id": s.inbound_id,
                "external_domain": s.external_domain,
                "external_port": s.external_port
            }
            for s in servers
        ],
        "clients": [
            {
                "id": c.id,
                "name": c.name,
                "sub_token": c.sub_token,
                "status": c.status,
                "created_at": c.created_at,
                "expiry_date": c.expiry_date,
                "data_limit_gb": c.data_limit_gb,
                "total_usage_bytes": c.total_usage_bytes
            }
            for c in clients
        ],
        "client_keys": [
            {
                "id": k.id,
                "client_id": k.client_id,
                "server_id": k.server_id,
                "outline_key_id": k.outline_key_id,
                "access_url": k.access_url,
                "created_at": k.created_at,
                "uuid": k.uuid,
                "last_seen_bytes": k.last_seen_bytes
            }
            for k in client_keys
        ]
    }

@router.post("/import")
async def import_backup(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Only JSON files are supported")
    
    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    
    if "servers" not in data or "clients" not in data or "client_keys" not in data:
        raise HTTPException(status_code=400, detail="Invalid backup format")
    
    for s in data.get("servers", []):
        server = db.query(Server).filter(Server.id == s["id"]).first()
        if server:
            for key, value in s.items():
                if hasattr(server, key):
                    setattr(server, key, value)
        else:
            server = Server(**s)
            db.add(server)
    
    for c in data.get("clients", []):
        client = db.query(Client).filter(Client.id == c["id"]).first()
        if client:
            for key, value in c.items():
                if hasattr(client, key):
                    setattr(client, key, value)
        else:
            client = Client(**c)
            db.add(client)
    
    for k in data.get("client_keys", []):
        key = db.query(ClientKey).filter(ClientKey.id == k["id"]).first()
        if key:
            for key_name, value in k.items():
                if hasattr(key, key_name):
                    setattr(key, key_name, value)
        else:
            key = ClientKey(**k)
            db.add(key)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit error during import: {e}")
    return {"ok": True}

@router.post("/webdav")
async def webdav_backup(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    webdav_url = body.get("webdav_url", "")
    webdav_username = body.get("webdav_username", "")
    webdav_password = body.get("webdav_password", "")
    
    if not webdav_url:
        raise HTTPException(status_code=400, detail="WebDAV URL is required")
    
    backup_data = await export_backup(db)
    filename = f"outline_panel_backup_{datetime.now(timezone.utc).strftime('%Y-%m-%d_%H%M%S')}.json"
    
    url = webdav_url.rstrip("/") + "/" + filename
    
    async with aiohttp.ClientSession() as session:
        async with session.put(
            url,
            data=json.dumps(backup_data).encode(),
            headers={"Content-Type": "application/json"},
            auth=aiohttp.BasicAuth(webdav_username, webdav_password),
            timeout=aiohttp.ClientTimeout(total=30),
            ssl=False
        ) as resp:
            if resp.status in [200, 201, 204]:
                return {"ok": True}
            else:
                raise HTTPException(status_code=500, detail=f"WebDAV upload failed: {resp.status}")

@router.post("/webdav/list")
async def webdav_list(request: Request):
    body = await request.json()
    webdav_url = body.get("webdav_url", "")
    webdav_username = body.get("webdav_username", "")
    webdav_password = body.get("webdav_password", "")
    
    if not webdav_url:
        raise HTTPException(status_code=400, detail="WebDAV URL is required")
    
    import re
    async with aiohttp.ClientSession() as session:
        async with session.request(
            "PROPFIND",
            webdav_url,
            auth=aiohttp.BasicAuth(webdav_username, webdav_password),
            timeout=aiohttp.ClientTimeout(total=30),
            ssl=False
        ) as resp:
            if resp.status != 207:
                raise HTTPException(status_code=500, detail="WebDAV list failed")
            
            text = await resp.text()
            files = []
            for match in re.finditer(r'<d:displayname>([^<]+)</d:displayname>', text):
                name = match.group(1)
                if name.endswith('.json') or name.endswith('.zip'):
                    files.append(os.path.basename(name))
            
            files.sort(reverse=True)
            return {"files": files}

@router.post("/webdav/restore")
async def webdav_restore(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    webdav_url = body.get("webdav_url", "")
    webdav_username = body.get("webdav_username", "")
    webdav_password = body.get("webdav_password", "")
    raw_filename = body.get("filename", "")
    
    if not all([webdav_url, raw_filename]):
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    filename = os.path.basename(raw_filename)
    url = webdav_url.rstrip("/") + "/" + filename
    
    async with aiohttp.ClientSession() as session:
        async with session.get(
            url,
            auth=aiohttp.BasicAuth(webdav_username, webdav_password),
            timeout=aiohttp.ClientTimeout(total=30),
            ssl=False
        ) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=500, detail="Failed to download backup")
            
            content = await resp.read()
            data = json.loads(content)
    
    for s in data.get("servers", []):
        server = db.query(Server).filter(Server.id == s["id"]).first()
        if server:
            for key, value in s.items():
                if hasattr(server, key):
                    setattr(server, key, value)
        else:
            server = Server(**s)
            db.add(server)
    
    for c in data.get("clients", []):
        client = db.query(Client).filter(Client.id == c["id"]).first()
        if client:
            for key, value in c.items():
                if hasattr(client, key):
                    setattr(client, key, value)
        else:
            client = Client(**c)
            db.add(client)
    
    for k in data.get("client_keys", []):
        key = db.query(ClientKey).filter(ClientKey.id == k["id"]).first()
        if key:
            for key_name, value in k.items():
                if hasattr(key, key_name):
                    setattr(key, key_name, value)
        else:
            key = ClientKey(**k)
            db.add(key)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit error during restore: {e}")
        
    return {"ok": True}

@router.delete("/webdav/delete")
async def webdav_delete(request: Request):
    body = await request.json()
    webdav_url = body.get("webdav_url", "")
    webdav_username = body.get("webdav_username", "")
    webdav_password = body.get("webdav_password", "")
    raw_filename = body.get("filename", "")
    
    if not all([webdav_url, raw_filename]):
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    filename = os.path.basename(raw_filename)
    url = webdav_url.rstrip("/") + "/" + filename
    
    async with aiohttp.ClientSession() as session:
        async with session.request(
            "DELETE",
            url,
            auth=aiohttp.BasicAuth(webdav_username, webdav_password),
            timeout=aiohttp.ClientTimeout(total=30),
            ssl=False
        ) as resp:
            if resp.status in [200, 204]:
                return {"ok": True}
            else:
                raise HTTPException(status_code=500, detail="Delete failed")
