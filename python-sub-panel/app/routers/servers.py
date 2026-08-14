from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Server, ClientKey, Client
from app.schemas import ServerCreate, ServerUpdate, ServerResponse, ServerStatusResponse
from typing import List
import uuid
import asyncio
import aiohttp

router = APIRouter()

def generate_id():
    return str(uuid.uuid4())

@router.get("/", response_model=List[ServerResponse])
async def list_servers(db: Session = Depends(get_db)):
    servers = db.query(Server).order_by(Server.created_at.desc()).all()
    return [
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
    ]

@router.get("/{server_id}", response_model=ServerResponse)
async def get_server(server_id: str, db: Session = Depends(get_db)):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return {
        "id": server.id,
        "name": server.name,
        "api_url": server.api_url,
        "cert_sha256": server.cert_sha256,
        "created_at": server.created_at,
        "type": server.type,
        "auth_username": server.auth_username,
        "auth_password": server.auth_password,
        "username": server.username,
        "password": server.password,
        "inbound_id": server.inbound_id,
        "external_domain": server.external_domain,
        "external_port": server.external_port
    }

@router.post("/", response_model=ServerResponse)
async def create_server(server_req: ServerCreate, db: Session = Depends(get_db)):
    server_id = generate_id()
    now = datetime.utcnow().isoformat()
    
    server = Server(
        id=server_id,
        name=server_req.name,
        api_url=server_req.api_url,
        cert_sha256=server_req.cert_sha256,
        created_at=now,
        type=server_req.type,
        auth_username=server_req.auth_username,
        auth_password=server_req.auth_password,
        username=server_req.username,
        password=server_req.password,
        inbound_id=server_req.inbound_id,
        external_domain=server_req.external_domain,
        external_port=server_req.external_port
    )
    db.add(server)
    db.commit()
    db.refresh(server)
    
    active_clients = db.query(Client).filter(Client.status == "active").all()
    from app.services.vpn_manager import generate_keys_for_client
    for client in active_clients:
        await generate_keys_for_client(client, [server_id], db)
    
    return {
        "id": server.id,
        "name": server.name,
        "api_url": server.api_url,
        "cert_sha256": server.cert_sha256,
        "created_at": server.created_at,
        "type": server.type,
        "auth_username": server.auth_username,
        "auth_password": server.auth_password,
        "username": server.username,
        "password": server.password,
        "inbound_id": server.inbound_id,
        "external_domain": server.external_domain,
        "external_port": server.external_port
    }

@router.put("/{server_id}", response_model=ServerResponse)
async def update_server(server_id: str, server_req: ServerUpdate, db: Session = Depends(get_db)):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    if server_req.name is not None:
        server.name = server_req.name
    if server_req.api_url is not None:
        server.api_url = server_req.api_url
    if server_req.cert_sha256 is not None:
        server.cert_sha256 = server_req.cert_sha256
    if server_req.type is not None:
        server.type = server_req.type
    if server_req.auth_username is not None:
        server.auth_username = server_req.auth_username
    if server_req.auth_password is not None:
        server.auth_password = server_req.auth_password
    if server_req.username is not None:
        server.username = server_req.username
    if server_req.password is not None:
        server.password = server_req.password
    if server_req.inbound_id is not None:
        server.inbound_id = server_req.inbound_id
    if server_req.external_domain is not None:
        server.external_domain = server_req.external_domain
    if server_req.external_port is not None:
        server.external_port = server_req.external_port
    
    db.commit()
    db.refresh(server)
    
    return {
        "id": server.id,
        "name": server.name,
        "api_url": server.api_url,
        "cert_sha256": server.cert_sha256,
        "created_at": server.created_at,
        "type": server.type,
        "auth_username": server.auth_username,
        "auth_password": server.auth_password,
        "username": server.username,
        "password": server.password,
        "inbound_id": server.inbound_id,
        "external_domain": server.external_domain,
        "external_port": server.external_port
    }

@router.delete("/{server_id}")
async def delete_server(server_id: str, db: Session = Depends(get_db)):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    from app.services.vpn_manager import delete_server_keys
    await delete_server_keys(server, db)
    
    db.delete(server)
    db.commit()
    return {"ok": True}

@router.get("/status", response_model=List[ServerStatusResponse])
async def get_status(db: Session = Depends(get_db)):
    servers = db.query(Server).all()
    results = []
    
    async def ping_server(server):
        try:
            start = time.time()
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    server.api_url,
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as resp:
                    latency = int((time.time() - start) * 1000)
                    return {"id": server.id, "online": True, "latency": latency}
        except Exception:
            return {"id": server.id, "online": False, "latency": None}
    
    tasks = [ping_server(s) for s in servers]
    results = await asyncio.gather(*tasks)
    return results

@router.get("/{server_id}/orphans")
async def get_orphans(server_id: str, db: Session = Depends(get_db)):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    from app.services.vpn_manager import get_orphan_keys
    orphans = await get_orphan_keys(server, db)
    return {"orphans": orphans}

@router.post("/{server_id}/orphans")
async def delete_orphans(server_id: str, request: Request, db: Session = Depends(get_db)):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    body = await request.json()
    orphan_ids = body.get("orphan_ids", [])
    
    from app.services.vpn_manager import delete_orphan_keys
    await delete_orphan_keys(server, orphan_ids, db)
    
    return {"ok": True}

@router.post("/{server_id}/sync-keys")
async def sync_server_keys(server_id: str, request: Request, db: Session = Depends(get_db)):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    body = await request.json()
    client_ids = body.get("client_ids", [])
    
    from app.services.vpn_manager import generate_keys_for_client
    synced = 0
    for client_id in client_ids:
        client = db.query(Client).filter(Client.id == client_id).first()
        if client and client.status == "active":
            await generate_keys_for_client(client, [server_id], db)
            synced += 1
    
    return {"ok": True, "synced": synced}
