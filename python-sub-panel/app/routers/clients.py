from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Client, ClientKey, Server, Setting
from app.schemas import ClientCreate, ClientUpdate, ClientResponse, ClientDetailResponse, UsageMetricsResponse, QuickRenewRequest
from typing import List, Optional
import uuid
import random
import string
from datetime import datetime, timedelta, timezone
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
    servers = db.query(Server).all()
    server_keys = {}
    for key in db.query(ClientKey).all():
        if key.server_id not in server_keys:
            server_keys[key.server_id] = []
        server_keys[key.server_id].append(key)
    
    from app.services.vpn_manager import fetch_server_metrics_single
    server_map = {s.id: s for s in servers}
    tasks = []
    task_server_ids = []
    
    for server_id, keys in server_keys.items():
        server = server_map.get(server_id)
        if server:
            tasks.append(fetch_server_metrics_single(server, keys))
            task_server_ids.append(server_id)
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    metrics_map = {}
    for s_id, res in zip(task_server_ids, results):
        if isinstance(res, dict):
            # Ensure values are ints or dicts matching schema
            metrics_map[s_id] = res
        else:
            metrics_map[s_id] = {}
            
    return {"metricsMap": metrics_map}

def format_client_response(c: Client) -> dict:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    
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
        "remaining_time": remaining_time,
        "notes": c.notes,
        "contact": c.contact,
        "plan_price": c.plan_price
    }

@router.get("", response_model=List[ClientResponse])
@router.get("/", response_model=List[ClientResponse])
async def list_clients(db: Session = Depends(get_db)):
    clients = db.query(Client).order_by(Client.created_at.desc()).all()
    return [format_client_response(c) for c in clients]

@router.get("/{client_id}", response_model=ClientDetailResponse)
async def get_client(client_id: str, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
        
    keys = db.query(ClientKey).filter(ClientKey.client_id == client_id).all()
    resp = format_client_response(client)
    
    server_ids = [k.server_id for k in keys]
    servers = {s.id: s for s in db.query(Server).filter(Server.id.in_(server_ids)).all()} if server_ids else {}
    
    key_responses = []
    for k in keys:
        server = servers.get(k.server_id)
        sname = server.name if server else "Unknown Server"
        cc = server.country_code if server else None
        cname = server.country_name if server else None
        
        from app.services.geo import get_flag_emoji
        flag = get_flag_emoji(cc)
        
        key_responses.append({
            "id": k.id,
            "client_id": k.client_id,
            "server_id": k.server_id,
            "server_name": sname,
            "server_type": server.type if server else None,
            "outline_key_id": k.outline_key_id,
            "access_url": k.access_url,
            "created_at": k.created_at,
            "last_seen_bytes": k.last_seen_bytes or 0,
            "is_online": getattr(k, 'is_online', False),
            "last_seen": getattr(k, 'last_seen', None),
            "flag_emoji": flag,
            "country_name": cname
        })
        
    resp["keys"] = key_responses
    return resp

@router.post("", response_model=ClientResponse)
@router.post("/", response_model=ClientResponse)
async def create_client(client_req: ClientCreate, db: Session = Depends(get_db)):
    client_id = generate_id()
    sub_token = generate_sub_token()
    
    now = datetime.now(timezone.utc).isoformat()
    
    client = Client(
        id=client_id,
        name=client_req.name,
        sub_token=sub_token,
        status=client_req.status,
        created_at=now,
        expiry_date=client_req.expiry_date,
        data_limit_gb=client_req.data_limit_gb,
        total_usage_bytes=0,
        notes=client_req.notes,
        contact=client_req.contact,
        plan_price=client_req.plan_price
    )
    db.add(client)
    try:
        db.commit()
        db.refresh(client)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create client: {e}")
    
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
    
    old_name = client.name
    
    if client_req.name is not None and client_req.name.strip():
        client.name = client_req.name.strip()
        
    # Preserve fields that were omitted from a PATCH-like update. The frontend may
    # intentionally send only the fields being changed.
    if "expiry_date" in client_req.model_fields_set:
        client.expiry_date = client_req.expiry_date
    if "data_limit_gb" in client_req.model_fields_set:
        if client_req.data_limit_gb is not None:
            try:
                client.data_limit_gb = int(client_req.data_limit_gb)
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="data_limit_gb must be an integer")
        else:
            client.data_limit_gb = None
    if "notes" in client_req.model_fields_set:
        client.notes = client_req.notes
    if "contact" in client_req.model_fields_set:
        client.contact = client_req.contact
    if "plan_price" in client_req.model_fields_set:
        client.plan_price = client_req.plan_price

    if client_req.status is not None:
        old_status = client.status
        client.status = client_req.status
        if old_status == "active" and client_req.status in ["inactive", "disabled", "expired", "limit_reached"]:
            from app.services.vpn_manager import block_client_keys
            await block_client_keys(client, db)
        elif old_status != "active" and client_req.status == "active":
            from app.services.vpn_manager import unblock_client_keys
            await unblock_client_keys(client, db)
            
    # Update remark in all client keys if name changed
    if old_name and client.name and old_name != client.name:
        keys = db.query(ClientKey).filter(ClientKey.client_id == client_id).all()
        for k in keys:
            if k.access_url and f" - {old_name}" in k.access_url:
                k.access_url = k.access_url.replace(f" - {old_name}", f" - {client.name}")
    
    try:
        db.commit()
        db.refresh(client)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update client: {e}")
    
    # Invalidate sub cache so changes reflect instantly
    from app.routers.sub import invalidate_sub_cache
    invalidate_sub_cache(client.sub_token)
    
    return format_client_response(client)

@router.post("/{client_id}/quick-renew", response_model=ClientResponse)
async def quick_renew_client(client_id: str, renew_req: Optional[QuickRenewRequest] = None, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
        
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    req = renew_req or QuickRenewRequest()
    days = req.days if req.days is not None else 30
    
    base_dt = now
    if client.expiry_date:
        try:
            exp_str = str(client.expiry_date)
            if "T" in exp_str:
                exp_dt = datetime.fromisoformat(exp_str.replace("Z", "+00:00")).replace(tzinfo=None)
            else:
                exp_dt = datetime.strptime(exp_str.split()[0], "%Y-%m-%d")
            if exp_dt > now:
                base_dt = exp_dt
        except Exception:
            base_dt = now
            
    from datetime import timedelta
    new_expiry = (base_dt + timedelta(days=days)).strftime("%Y-%m-%d")
    client.expiry_date = new_expiry
    
    if req.add_gb and req.add_gb > 0:
        current_gb = client.data_limit_gb or 0
        client.data_limit_gb = current_gb + req.add_gb
        
    if req.reset_usage:
        client.total_usage_bytes = 0
        keys = db.query(ClientKey).filter(ClientKey.client_id == client_id).all()
        for k in keys:
            k.last_seen_bytes = 0
            
    client.status = "active"
    db.commit()
    db.refresh(client)
    
    from app.services.vpn_manager import unblock_client_keys
    await unblock_client_keys(client, db)
    
    from app.routers.sub import invalidate_sub_cache
    invalidate_sub_cache(client.sub_token)
    
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
    db.refresh(client)
    
    from app.services.vpn_manager import unblock_client_keys
    await unblock_client_keys(client, db)
    
    from app.routers.sub import invalidate_sub_cache
    invalidate_sub_cache(client.sub_token)
    
    return format_client_response(client)

from fastapi.responses import JSONResponse

@router.post("/{client_id}/sync-keys")
async def sync_keys(client_id: str, force: bool = False, db: Session = Depends(get_db)):
    try:
        client = db.query(Client).filter(Client.id == client_id).first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        if client.status != "active":
            raise HTTPException(status_code=400, detail="Client is not active")
        
        from app.services.vpn_manager import delete_client_keys, generate_keys_for_client
        
        if force:
            await delete_client_keys(client, db)
            all_servers = db.query(Server).all()
            all_server_ids = [s.id for s in all_servers]
            if all_server_ids:
                await generate_keys_for_client(client, all_server_ids, db)
            return {"ok": True, "synced": len(all_server_ids)}
        
        existing_keys = db.query(ClientKey).filter(ClientKey.client_id == client_id).all()
        invalid_keys = [k for k in existing_keys if not k.access_url or k.access_url.startswith("3x-ui-sub:") or "security=none" in k.access_url]
        
        for ik in invalid_keys:
            server = db.query(Server).filter(Server.id == ik.server_id).first()
            if server and server.type == "3x-ui" and ik.uuid:
                try:
                    from app.services.three_xui import delete_3xui_client
                    await delete_3xui_client(server, ik.uuid)
                except Exception:
                    pass
            db.delete(ik)
            
        if invalid_keys:
            db.commit()

        # Regenerate keys for ALL servers (generate_keys_for_client handles old key cleanup)
        all_servers = db.query(Server).all()
        all_server_ids = [s.id for s in all_servers]
        
        if all_server_ids:
            await generate_keys_for_client(client, all_server_ids, db)
        
        return {"ok": True, "synced": len(all_server_ids)}
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception(f"Error in client sync_keys: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "detail": f"Client Sync Error: {str(e)}"})

@router.post("/{client_id}/keys/{server_id}/regenerate")
async def regenerate_single_key(client_id: str, server_id: str, db: Session = Depends(get_db)):
    try:
        client = db.query(Client).filter(Client.id == client_id).first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
            
        server = db.query(Server).filter(Server.id == server_id).first()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
            
        from app.services.vpn_manager import generate_keys_for_client
        await generate_keys_for_client(client, [server_id], db)
        
        return format_client_response(client)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import logging
        logging.getLogger(__name__).exception(f"Error regenerating key: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "detail": f"Regeneration Error: {str(e)}"})
