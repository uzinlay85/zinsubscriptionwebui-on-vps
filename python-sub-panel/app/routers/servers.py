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
from datetime import datetime, timezone

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
        "auth_password": "********" if s.auth_password else None,
        "username": s.username,
        "password": "********" if s.password else None,
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
    # Read-only country code resolution for response formatting without GET DB mutation
    for s in servers:
        if not s.country_code:
            try:
                cc, cname, _ = await detect_server_country(s)
                s.country_code = cc
                s.country_name = cname
            except Exception:
                pass
    return [format_server_response(s, key_counts.get(s.id, 0)) for s in servers]

@router.get("/status", response_model=List[ServerStatusResponse])
@router.get("/status/", response_model=List[ServerStatusResponse])
async def get_status(db: Session = Depends(get_db)):
    servers = db.query(Server).all()
    
    async def ping_server(server):
        try:
            start = time.time()
            if server.type == "outline":
                from app.services.outline import get_outline_base_url
                base_url = get_outline_base_url(server)
                url = f"{base_url}/access-keys"
                headers = {}
            elif server.type in ["hysteria2", "hysteria2_python"]:
                from app.services.hysteria2 import get_auth_headers
                url = server.api_url.rstrip("/")
                headers = get_auth_headers(server)
                if not url.endswith("/api/users") and not url.endswith("/users"):
                    url = f"{url}/api/users"
            elif server.type == "3x-ui":
                url = server.api_url.rstrip("/")
                headers = {}
            else:
                url = server.api_url.rstrip("/")
                headers = {}
            
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

import json
import logging

logger = logging.getLogger(__name__)

@router.post("", response_model=ServerResponse)
@router.post("/", response_model=ServerResponse)
async def create_server(server_req: ServerCreate, db: Session = Depends(get_db)):
    try:
        # Sanitize API URL & Cert
        api_url = (server_req.api_url or "").strip().strip('"').strip("'")
        cert_sha256 = (server_req.cert_sha256 or "").strip() if server_req.cert_sha256 else None
        
        # If user pasted raw Outline JSON into api_url: {"apiUrl":"...", "certSha256":"..."}
        if api_url.startswith("{") and "apiUrl" in api_url:
            try:
                parsed = json.loads(api_url)
                api_url = parsed.get("apiUrl", api_url).strip()
                if not cert_sha256 and parsed.get("certSha256"):
                    cert_sha256 = parsed.get("certSha256").strip()
            except Exception:
                pass

        if not api_url:
            raise HTTPException(status_code=400, detail="API URL is required.")

        # --- Pre-validate 3x-ui credentials BEFORE saving ---
        if server_req.type == "3x-ui":
            from app.services.three_xui import login_3xui_standalone

            class _TempServer:
                api_url = api_url
                username = server_req.username or ""
                auth_username = server_req.auth_username or ""
                password = server_req.password or ""
                auth_password = server_req.auth_password or ""
                name = server_req.name or ""

            api_base, err = await login_3xui_standalone(_TempServer())
            if not api_base:
                raise HTTPException(
                    status_code=400,
                    detail=f"3x-ui Panel login failed: {err}"
                )

        server_id = generate_id()
        now = datetime.now(timezone.utc).isoformat()

        server = Server(
            id=server_id,
            name=server_req.name.strip(),
            api_url=api_url,
            cert_sha256=cert_sha256,
            created_at=now,
            type=server_req.type,
            auth_username=server_req.auth_username.strip() if server_req.auth_username else None,
            auth_password=server_req.auth_password.strip() if server_req.auth_password else None,
            username=server_req.username.strip() if server_req.username else None,
            password=server_req.password.strip() if server_req.password else None,
            inbound_id=server_req.inbound_id,
            external_domain=server_req.external_domain.strip() if server_req.external_domain else None,
            external_port=server_req.external_port,
            is_active=server_req.is_active if server_req.is_active is not None else True,
            country_code=server_req.country_code.strip().upper() if server_req.country_code else None,
            country_name=server_req.country_name.strip() if server_req.country_name else None
        )
        
        if not server.country_code:
            try:
                cc, cname, _ = await detect_server_country(server)
                server.country_code = cc
                server.country_name = cname
            except Exception as geo_err:
                logger.debug(f"Geo detection skipped: {geo_err}")
                
        db.add(server)
        db.commit()
        db.refresh(server)

        # Safe key generation for active clients
        active_clients = db.query(Client).filter(Client.status == "active").all()
        if active_clients:
            from app.services.vpn_manager import generate_keys_for_client
            async def _safe_gen(c):
                try:
                    await generate_keys_for_client(c, [server_id], db)
                except Exception as e:
                    logger.error(f"Error generating keys for client {c.name} on server {server.name}: {e}")

            await asyncio.gather(*[_safe_gen(c) for c in active_clients], return_exceptions=True)

        return format_server_response(server)

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception(f"Failed to create server: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save server: {str(e)}")

@router.put("/{server_id}", response_model=ServerResponse)
async def update_server(server_id: str, server_req: ServerUpdate, db: Session = Depends(get_db)):
    try:
        server = db.query(Server).filter(Server.id == server_id).first()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        
        if server_req.name is not None:
            server.name = server_req.name.strip()
        if server_req.api_url is not None:
            raw_url = server_req.api_url.strip().strip('"').strip("'")
            if raw_url.startswith("{") and "apiUrl" in raw_url:
                try:
                    parsed = json.loads(raw_url)
                    raw_url = parsed.get("apiUrl", raw_url).strip()
                    if not server_req.cert_sha256 and parsed.get("certSha256"):
                        server.cert_sha256 = parsed.get("certSha256").strip()
                except Exception:
                    pass
            server.api_url = raw_url
        if server_req.cert_sha256 is not None:
            server.cert_sha256 = server_req.cert_sha256.strip() if server_req.cert_sha256 else None
        if server_req.type is not None:
            server.type = server_req.type
        if server_req.auth_username is not None:
            server.auth_username = server_req.auth_username.strip() if server_req.auth_username else None
        if server_req.auth_password is not None and server_req.auth_password.strip() and server_req.auth_password != "********":
            server.auth_password = server_req.auth_password.strip()
        if server_req.username is not None:
            server.username = server_req.username.strip() if server_req.username else None
        if server_req.password is not None and server_req.password.strip() and server_req.password != "********":
            server.password = server_req.password.strip()
        if server_req.inbound_id is not None:
            server.inbound_id = server_req.inbound_id
        if server_req.external_domain is not None:
            server.external_domain = server_req.external_domain.strip() if server_req.external_domain else None
        if server_req.external_port is not None:
            server.external_port = server_req.external_port
        if server_req.is_active is not None:
            server.is_active = server_req.is_active
        if server_req.country_code is not None:
            server.country_code = server_req.country_code.strip().upper() if server_req.country_code else None
        if server_req.country_name is not None:
            server.country_name = server_req.country_name.strip() if server_req.country_name else None
            
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
                elif client and server.type == "outline":
                    from app.services.outline import rewrite_outline_access_url
                    if k.access_url and "ss://" in k.access_url:
                        raw_acc = k.access_url.split("#")[0]
                        new_raw = rewrite_outline_access_url(raw_acc, server)
                        k.access_url = f"{new_raw}#{flag} {server.name} - {client.name}"
            db.commit()

        # Invalidate sub cache so changes reflect instantly
        from app.routers.sub import invalidate_sub_cache
        invalidate_sub_cache()
        
        return format_server_response(server)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception(f"Failed to update server: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update server: {str(e)}")

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

from fastapi.responses import JSONResponse

async def diagnose_server_failure(server: Server) -> str:
    api_url = (server.api_url or "").rstrip("/")
    if not api_url:
        return f"Server '{server.name}' has an empty API URL."
    
    try:
        if server.type == "outline":
            from app.services import outline
            base_url = outline.get_outline_base_url(server)
            test_url = f"{base_url}/access-keys"
            async with aiohttp.ClientSession() as session:
                try:
                    async with session.post(
                        test_url,
                        json={"name": "test_diag"},
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as resp:
                        text = await resp.text()
                        if resp.status in [200, 201]:
                            try:
                                data = await resp.json()
                                kid = data.get("id")
                                if kid:
                                    await session.delete(f"{test_url}/{kid}", ssl=False)
                            except Exception:
                                pass
                            return f"Outline server '{server.name}' test key creation OK."
                        elif resp.status in [401, 403]:
                            return f"Outline server '{server.name}' HTTP {resp.status} Unauthorized. Invalid or expired secret key token in API URL."
                        else:
                            return f"Outline server '{server.name}' POST /access-keys HTTP {resp.status}: {text[:150]}"
                except Exception as ex:
                    return f"Outline server '{server.name}' POST /access-keys error: {ex}"
        
        elif server.type in ["hysteria2", "hysteria2_python"]:
            from app.services import hysteria2
            # Test express endpoint
            res = await hysteria2.express_create_user(server, "test_diag", "test_pass_12345")
            if res:
                await hysteria2.express_delete_user(server, res.get("user_id", "test_diag"))
                return f"Hysteria2 server '{server.name}' test user creation (Express REST) OK."
            
            # Test flask endpoint
            ok = await hysteria2.flask_add_user(server, "test_diag", "test_pass_12345")
            if ok:
                try:
                    await hysteria2.flask_delete_user(server, "test_pass_12345")
                except Exception:
                    pass
                return f"Hysteria2 server '{server.name}' test user creation (WebUI) OK."
            else:
                return f"Hysteria2 server '{server.name}' user creation failed. Please verify API URL '{server.api_url}' and Admin Password (current: '{server.auth_password or server.password or 'admin123'}')."
        
        elif server.type == "3x-ui":
            from app.services.three_xui import login_3xui_standalone
            api_base, err = await login_3xui_standalone(server)
            if not api_base:
                return f"3x-ui Login Failed for '{server.name}': {err}"
            else:
                return f"3x-ui Login OK for '{server.name}', but adding client to inbounds failed. Check inbounds configuration."

        return f"Unable to generate keys on server '{server.name}'."

    except aiohttp.ClientConnectorError as e:
        return f"Connection Failed to {server.name} ({api_url}): Cannot connect to host/port ({e}). Check server firewall or port."
    except asyncio.TimeoutError:
        return f"Connection Timeout (5s) to {server.name} ({api_url}). Server is unresponsive."
    except Exception as e:
        return f"Error connecting to {server.name} ({api_url}): {e}"

@router.post("/{server_id}/sync-keys")
async def sync_server_keys(server_id: str, request: Request, db: Session = Depends(get_db)):
    try:
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
            active_clients = db.query(Client).filter(Client.status == "active").all()
            target_clients = active_clients
        else:
            target_clients = db.query(Client).filter(Client.id.in_(client_ids), Client.status == "active").all()

        keys_before = db.query(ClientKey).filter(ClientKey.server_id == server_id).count()
        for client in target_clients:
            await generate_keys_for_client(client, [server_id], db)
        keys_after = db.query(ClientKey).filter(ClientKey.server_id == server_id).count()

        warning_msg = None
        if len(target_clients) > 0 and keys_after == 0:
            try:
                warning_msg = await diagnose_server_failure(server)
            except Exception as diag_err:
                warning_msg = f"Failed to generate keys for server '{server.name}': {diag_err}"
        
        return {
            "ok": True,
            "server_name": server.name,
            "synced": len(target_clients),
            "created_keys": keys_after,
            "total_clients": len(target_clients),
            "warning": warning_msg
        }
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception(f"Error in sync_server_keys: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "detail": f"Server Error: {str(e)}"})

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
