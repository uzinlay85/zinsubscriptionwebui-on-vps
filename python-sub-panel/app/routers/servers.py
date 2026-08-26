from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Server, ClientKey, Client
from app.schemas import ServerCreate, ServerUpdate, ServerResponse, ServerStatusResponse
from typing import List
import uuid
import asyncio
import aiohttp
import time
from datetime import datetime

router = APIRouter()

from app.services.geo import detect_server_country, get_flag_emoji

from sqlalchemy import func

def generate_id():
    return str(uuid.uuid4())

def format_server_response(s: Server, key_count: int = 0) -> dict:
    flag = get_flag_emoji(s.country_code)
    return {
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
        "external_port": s.external_port,
        "is_active": s.is_active if s.is_active is not None else True,
        "country_code": s.country_code,
        "country_name": s.country_name,
        "flag_emoji": flag,
        "total_keys": key_count
    }

@router.get("", response_model=List[ServerResponse])
@router.get("/", response_model=List[ServerResponse])
async def list_servers(db: Session = Depends(get_db)):
    servers = db.query(Server).order_by(Server.created_at.desc()).all()
    key_counts = dict(
        db.query(ClientKey.server_id, func.count(ClientKey.id))
        .group_by(ClientKey.server_id)
        .all()
    )
    # Auto-resolve country for any servers that don't have it yet
    for s in servers:
        if not s.country_code:
            try:
                cc, cname, _ = await detect_server_country(s)
                s.country_code = cc
                s.country_name = cname
            except Exception:
                pass
    db.commit()
    return [format_server_response(s, key_counts.get(s.id, 0)) for s in servers]

@router.get("/status", response_model=List[ServerStatusResponse])
@router.get("/status/", response_model=List[ServerStatusResponse])
async def get_status(db: Session = Depends(get_db)):
    servers = db.query(Server).all()
    
    async def ping_server(server):
        try:
            start = time.time()
            url = server.api_url.rstrip("/")
            if server.type == "outline":
                url = f"{url}/access-keys"
            elif server.type == "hysteria2":
                url = f"{url}/api/users"
            elif server.type == "hysteria2_python":
                url = url
            
            headers = {}
            if server.auth_username and server.auth_password:
                import base64
                token = base64.b64encode(f"{server.auth_username}:{server.auth_password}".encode()).decode()
                headers["Authorization"] = f"Basic {token}"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as resp:
                    latency = int((time.time() - start) * 1000)
                    is_online = resp.status < 500
                    return {"id": server.id, "online": is_online, "latency": latency}
        except Exception:
            return {"id": server.id, "online": False, "latency": None}
    
    tasks = [ping_server(s) for s in servers]
    results = await asyncio.gather(*tasks)
    return results

@router.get("/{server_id}", response_model=ServerResponse)
async def get_server(server_id: str, db: Session = Depends(get_db)):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return format_server_response(server)

@router.post("", response_model=ServerResponse)
@router.post("/", response_model=ServerResponse)
async def create_server(server_req: ServerCreate, db: Session = Depends(get_db)):

    # --- Pre-validate 3x-ui credentials BEFORE saving ---
    if server_req.type == "3x-ui":
        from app.services.three_xui import login_3xui
        import aiohttp

        # Build a temporary Server-like object for validation
        class _TempServer:
            api_url = server_req.api_url or ""
            username = server_req.username or ""
            auth_username = server_req.auth_username or ""
            password = server_req.password or ""
            auth_password = server_req.auth_password or ""
            name = server_req.name or ""

        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            api_base, _ = await login_3xui(session, _TempServer())

        if not api_base:
            raise HTTPException(
                status_code=400,
                detail="3x-ui Panel login failed. Please check the Panel URL, Username, and Password."
            )

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
        external_port=server_req.external_port,
        is_active=server_req.is_active if server_req.is_active is not None else True,
        country_code=server_req.country_code,
        country_name=server_req.country_name
    )
    
    if not server.country_code:
        try:
            cc, cname, _ = await detect_server_country(server)
            server.country_code = cc
            server.country_name = cname
        except Exception:
            pass
            
    db.add(server)
    db.commit()
    db.refresh(server)

    active_clients = db.query(Client).filter(Client.status == "active").all()
    if active_clients:
        from app.services.vpn_manager import generate_keys_for_client
        tasks = [generate_keys_for_client(c, [server_id], db) for c in active_clients]
        await asyncio.gather(*tasks, return_exceptions=True)

    return format_server_response(server)

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
    if server_req.is_active is not None:
        server.is_active = server_req.is_active
    if server_req.country_code is not None:
        server.country_code = server_req.country_code
    if server_req.country_name is not None:
        server.country_name = server_req.country_name
        
    if not server.country_code:
        try:
            cc, cname, _ = await detect_server_country(server)
            server.country_code = cc
            server.country_name = cname
        except Exception:
            pass
    
    db.commit()
    db.refresh(server)
    
    flag = get_flag_emoji(server.country_code)
    # Refresh existing client keys access_url for this server
    existing_keys = db.query(ClientKey).filter(ClientKey.server_id == server_id).all()
    if existing_keys:
        for k in existing_keys:
            client = db.query(Client).filter(Client.id == k.client_id).first()
            if client and server.type in ["hysteria2", "hysteria2_python"]:
                raw_host_port = server.api_url.replace('https://', '').replace('http://', '').rstrip('/').split('/')[0]
                if ':' in raw_host_port:
                    parsed_host, parsed_port = raw_host_port.split(':')[0], raw_host_port.split(':')[1]
                else:
                    parsed_host, parsed_port = raw_host_port, "10443"
                host = server.external_domain or parsed_host
                port = server.external_port or int(parsed_port)
                k.access_url = f"hy2://{k.outline_key_id}@{host}:{port}/?security=tls&sni={host}#{flag} {server.name} - {client.name}"
    # Invalidate sub cache so changes reflect instantly
    from app.routers.sub import invalidate_sub_cache
    invalidate_sub_cache()
    
    return format_server_response(server)

@router.post("/{server_id}/toggle-active")
async def toggle_server_active(server_id: str, db: Session = Depends(get_db)):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    curr = server.is_active if server.is_active is not None else True
    server.is_active = not curr
    db.commit()
    db.refresh(server)
    
    from app.routers.sub import invalidate_sub_cache
    invalidate_sub_cache()
    
    return {"ok": True, "id": server.id, "name": server.name, "is_active": server.is_active}

@router.delete("/{server_id}")
async def delete_server(server_id: str, db: Session = Depends(get_db)):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    from app.services.vpn_manager import delete_server_keys
    await delete_server_keys(server, db)
    
    db.delete(server)
    db.commit()
    
    from app.routers.sub import invalidate_sub_cache
    invalidate_sub_cache()
    
    return {"ok": True}

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

@router.post("/sync-all-keys")
async def sync_all_servers_keys(db: Session = Depends(get_db)):
    all_servers = db.query(Server).all()
    active_clients = db.query(Client).filter(Client.status == "active").all()
    
    from app.services.vpn_manager import generate_keys_for_client
    
    total_synced_keys = 0
    clients_synced = 0
    
    for client in active_clients:
        existing_key_server_ids = {k.server_id for k in db.query(ClientKey).filter(ClientKey.client_id == client.id).all()}
        missing_server_ids = [s.id for s in all_servers if s.id not in existing_key_server_ids]
        if missing_server_ids:
            await generate_keys_for_client(client, missing_server_ids, db)
            total_synced_keys += len(missing_server_ids)
            clients_synced += 1
            
    return {"ok": True, "synced_keys": total_synced_keys, "clients_count": clients_synced}

@router.post("/{server_id}/sync-keys")
async def sync_server_keys(server_id: str, request: Request, db: Session = Depends(get_db)):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    client_ids = []
    try:
        body = await request.json()
        client_ids = body.get("client_ids", [])
    except Exception:
        client_ids = []
    
    from app.services.vpn_manager import generate_keys_for_client
    
    if not client_ids:
        # Regenerate keys for ALL active clients on this server
        # generate_keys_for_client() handles cleanup of old keys before creating new ones
        active_clients = db.query(Client).filter(Client.status == "active").all()
        target_clients = active_clients
    else:
        target_clients = db.query(Client).filter(Client.id.in_(client_ids), Client.status == "active").all()

    synced = 0
    for client in target_clients:
        await generate_keys_for_client(client, [server_id], db)
        synced += 1
    
    return {"ok": True, "server_name": server.name, "synced": synced, "total_clients": len(target_clients)}

@router.delete("/{server_id}/keys")
async def delete_all_server_keys(server_id: str, db: Session = Depends(get_db)):
    """Delete all client keys associated with this server (both remote and local DB)."""
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    from app.services.vpn_manager import delete_server_keys
    
    # Count keys before deletion
    key_count = db.query(ClientKey).filter(ClientKey.server_id == server_id).count()
    
    # Get affected client IDs for cache invalidation
    affected_clients = db.query(Client).join(
        ClientKey, Client.id == ClientKey.client_id
    ).filter(ClientKey.server_id == server_id).all()
    
    # Delete keys from remote server and local DB
    await delete_server_keys(server, db)
    
    # Invalidate subscription cache for affected clients
    try:
        from app.routers.sub import invalidate_sub_cache
        for client in affected_clients:
            invalidate_sub_cache(client.sub_token)
    except Exception:
        pass
    
    return {
        "ok": True,
        "server_name": server.name,
        "deleted_keys": key_count,
        "affected_clients": len(affected_clients)
    }
