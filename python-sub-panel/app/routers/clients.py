from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Client, ClientKey, Server, Setting
from app.schemas import ClientCreate, ClientUpdate, ClientResponse, ClientDetailResponse, UsageMetricsResponse
from typing import List, Optional
import uuid
import random
import string
from datetime import datetime, timedelta
import asyncio
import aiohttp

router = APIRouter()

def generate_id():
    return str(uuid.uuid4())

def generate_sub_token():
    return str(uuid.uuid4())

def generate_password():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=6))

@router.get("/usage", response_model=UsageMetricsResponse)
async def get_usage(request: Request, db: Session = Depends(get_db)):
    clients = db.query(Client).filter(Client.status == "active").all()
    servers = db.query(Server).all()
    
    metrics_map = {}
    
    async def fetch_outline_metrics(server, keys):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{server.api_url}/metrics/transfer",
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("bytesTransferredByUserId", {})
        except Exception:
            pass
        return {}
    
    async def fetch_3xui_metrics(server, keys):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{server.api_url}/",
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as resp:
                    if resp.status != 200:
                        return {}
                    html = await resp.text()
                    import re
                    csrf_match = re.search(r'csrfToken.*?"([^"]+)"', html)
                    if not csrf_match:
                        return {}
                    csrf_token = csrf_match.group(1)
                    
                    async with session.post(
                        f"{server.api_url}/login",
                        data={"username": server.username, "password": server.password},
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as login_resp:
                        if login_resp.status != 200:
                            return {}
                
                async with session.get(
                    f"{server.api_url}/panel/api/inbounds/clientTraffics",
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get("success"):
                            traffics = {}
                            for item in data.get("obj", []):
                                email = item.get("email", "")
                                up = item.get("up", 0) or 0
                                down = item.get("down", 0) or 0
                                traffics[email] = up + down
                            return traffics
        except Exception:
            pass
        return {}
    
    async def fetch_hysteria2_metrics(server, keys):
        try:
            auth = None
            if server.auth_username and server.auth_password:
                import base64
                token = base64.b64encode(f"{server.auth_username}:{server.auth_password}".encode()).decode()
                auth = {"Authorization": f"Basic {token}"}
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{server.api_url}/api/users",
                    headers=auth,
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as resp:
                    if resp.status == 200:
                        users = await resp.json()
                        metrics = {}
                        for user in users:
                            username = user.get("username", "")
                            tx = user.get("tx", 0) or 0
                            rx = user.get("rx", 0) or 0
                            metrics[username] = tx + rx
                        return metrics
        except Exception:
            pass
        return {}
    
    server_keys = {}
    for key in db.query(ClientKey).all():
        if key.server_id not in server_keys:
            server_keys[key.server_id] = []
        server_keys[key.server_id].append(key)
    
    tasks = []
    server_map = {s.id: s for s in servers}
    
    for server_id, keys in server_keys.items():
        server = server_map.get(server_id)
        if not server:
            continue
        
        if server.type == "outline":
            tasks.append(fetch_outline_metrics(server, keys))
        elif server.type in ["3x-ui"]:
            tasks.append(fetch_3xui_metrics(server, keys))
        elif server.type in ["hysteria2", "hysteria2_python"]:
            tasks.append(fetch_hysteria2_metrics(server, keys))
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    for server_id, result in zip(server_keys.keys(), results):
        if isinstance(result, dict):
            metrics_map[server_id] = result
    
    return {"metricsMap": metrics_map}

def format_client_response(c: Client) -> dict:
    now = datetime.utcnow()
    
    # 1. Calculate remaining time
    remaining_time = "Unlimited"
    exp_val = getattr(c, 'expiry_date', None)
    if exp_val:
        try:
            exp_str = str(exp_val)
            if "T" in exp_str:
                exp_dt = datetime.fromisoformat(exp_str.replace("Z", "+00:00")).replace(tzinfo=None)
            else:
                exp_dt = datetime.strptime(exp_str.split()[0], "%Y-%m-%d")
            
            if now > exp_dt:
                days_ago = (now - exp_dt).days
                remaining_time = f"Expired ({days_ago}d ago)" if days_ago > 0 else "Expired today"
            else:
                diff = exp_dt - now
                days = diff.days
                hours = diff.seconds // 3600
                if days > 0:
                    remaining_time = f"{days}d {hours}h left"
                else:
                    remaining_time = f"{hours}h left"
        except Exception:
            remaining_time = str(exp_val)

    # 2. Calculate online status
    is_online = False
    last_seen_val = getattr(c, 'last_seen', None)
    if c.status == "active" and last_seen_val:
        try:
            ls_str = str(last_seen_val)
            if "T" in ls_str:
                ls_dt = datetime.fromisoformat(ls_str.replace("Z", "+00:00")).replace(tzinfo=None)
            else:
                ls_dt = datetime.strptime(ls_str.split()[0] + (" " + ls_str.split()[1] if len(ls_str.split()) > 1 else ""), "%Y-%m-%d %H:%M:%S")
            if (now - ls_dt).total_seconds() < 600:
                is_online = True
        except Exception:
            pass

    return {
        "id": c.id,
        "name": c.name,
        "sub_token": c.sub_token,
        "status": c.status,
        "created_at": c.created_at,
        "expiry_date": exp_val,
        "data_limit_gb": c.data_limit_gb,
        "total_usage_bytes": c.total_usage_bytes or 0,
        "last_seen": last_seen_val,
        "is_online": is_online,
        "remaining_time": remaining_time
    }

@router.get("", response_model=List[ClientResponse])
@router.get("/", response_model=List[ClientResponse])
async def list_clients(db: Session = Depends(get_db)):
    try:
        from app.services.vpn_manager import sync_all_usage
        await sync_all_usage(db)
    except Exception:
        pass
    clients = db.query(Client).order_by(Client.created_at.desc()).all()
    return [format_client_response(c) for c in clients]

@router.get("/{client_id}", response_model=ClientDetailResponse)
async def get_client(client_id: str, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    keys = db.query(ClientKey).filter(ClientKey.client_id == client_id).all()
    server_map = {s.id: s for s in db.query(Server).all()}
    
    key_responses = []
    for k in keys:
        server = server_map.get(k.server_id)
        key_responses.append({
            "id": k.id,
            "server_id": k.server_id,
            "outline_key_id": k.outline_key_id,
            "access_url": k.access_url,
            "created_at": k.created_at,
            "uuid": k.uuid,
            "last_seen_bytes": k.last_seen_bytes,
            "server_name": server.name if server else None,
            "server_type": server.type if server else None
        })
    
    res = format_client_response(client)
    res["keys"] = key_responses
    return res

@router.post("", response_model=ClientResponse)
@router.post("/", response_model=ClientResponse)
async def create_client(client_req: ClientCreate, db: Session = Depends(get_db)):
    client_id = generate_id()
    sub_token = generate_sub_token()
    
    now = datetime.utcnow().isoformat()
    
    client = Client(
        id=client_id,
        name=client_req.name,
        sub_token=sub_token,
        status=client_req.status,
        created_at=now,
        expiry_date=client_req.expiry_date,
        data_limit_gb=client_req.data_limit_gb,
        total_usage_bytes=0
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    
    target_server_ids = client_req.server_ids
    if not target_server_ids:
        target_server_ids = [s.id for s in db.query(Server).all()]
        
    if target_server_ids:
        from app.services.vpn_manager import generate_keys_for_client
        await generate_keys_for_client(client, target_server_ids, db)
    
    return format_client_response(client)

@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(client_id: str, client_req: ClientUpdate, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if client_req.name is not None:
        client.name = client_req.name
    if client_req.expiry_date is not None:
        client.expiry_date = client_req.expiry_date
    if client_req.data_limit_gb is not None:
        client.data_limit_gb = client_req.data_limit_gb
    if client_req.status is not None:
        old_status = client.status
        client.status = client_req.status
        if old_status == "active" and client_req.status in ["inactive", "expired", "limit_reached"]:
            from app.services.vpn_manager import block_client_keys
            await block_client_keys(client, db)
        elif old_status != "active" and client_req.status == "active":
            from app.services.vpn_manager import unblock_client_keys
            await unblock_client_keys(client, db)
    
    db.commit()
    db.refresh(client)
    
    return format_client_response(client)

@router.delete("/{client_id}")
async def delete_client(client_id: str, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    from app.services.vpn_manager import delete_client_keys
    await delete_client_keys(client, db)
    
    db.delete(client)
    db.commit()
    return {"ok": True}

@router.post("/{client_id}/reset-usage")
async def reset_usage(client_id: str, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    client.total_usage_bytes = 0
    client.status = "active"
    
    keys = db.query(ClientKey).filter(ClientKey.client_id == client_id).all()
    for k in keys:
        k.last_seen_bytes = 0
    
    db.commit()
    
    from app.services.vpn_manager import unblock_client_keys
    await unblock_client_keys(client, db)
    
    return {"ok": True}

@router.post("/{client_id}/sync-keys")
async def sync_keys(client_id: str, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if client.status != "active":
        raise HTTPException(status_code=400, detail="Client is not active")
    
    existing_keys = db.query(ClientKey).filter(ClientKey.client_id == client_id).all()
    
    # Delete broken or outdated keys (e.g. 3x-ui-sub:) so they can be regenerated cleanly
    invalid_keys = [k for k in existing_keys if not k.access_url or k.access_url.startswith("3x-ui-sub:")]
    for ik in invalid_keys:
        db.delete(ik)
    if invalid_keys:
        db.commit()
        existing_keys = db.query(ClientKey).filter(ClientKey.client_id == client_id).all()

    existing_server_ids = {k.server_id for k in existing_keys}
    all_servers = db.query(Server).all()
    
    missing_server_ids = [s.id for s in all_servers if s.id not in existing_server_ids]
    
    if missing_server_ids:
        from app.services.vpn_manager import generate_keys_for_client
        await generate_keys_for_client(client, missing_server_ids, db)
    
    return {"ok": True, "synced": len(missing_server_ids)}
