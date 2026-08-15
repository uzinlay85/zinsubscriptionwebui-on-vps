from sqlalchemy.orm import Session
from app.models import Client, ClientKey, Server, Setting
from app.services import outline, hysteria2
import uuid
import random
import string
import asyncio
import aiohttp
import json
import re
from datetime import datetime
from typing import List, Dict, Optional, Any

def generate_id():
    return str(uuid.uuid4())

def generate_password():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=6))

def generate_uuid():
    return str(uuid.uuid4())

def generate_sub_id():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=16))

async def generate_keys_for_client(client: Client, server_ids: list, db: Session):
    servers = db.query(Server).filter(Server.id.in_(server_ids)).all()
    
    for server in servers:
        # Delete any pre-existing key for this exact (client_id, server_id) to prevent duplicate cards
        old_keys = db.query(ClientKey).filter(
            ClientKey.client_id == client.id,
            ClientKey.server_id == server.id
        ).all()
        for ok in old_keys:
            if server.type == "3x-ui" and ok.uuid:
                try:
                    from app.services.three_xui import delete_3xui_client
                    await delete_3xui_client(server, ok.uuid)
                except Exception:
                    pass
            db.delete(ok)
        if old_keys:
            db.commit()
            
        key_id = generate_id()
        now = datetime.utcnow().isoformat()
        
        if server.type == "outline":
            result = await outline.create_key(server, client.name)
            if result:
                client_key = ClientKey(
                    id=key_id,
                    client_id=client.id,
                    server_id=server.id,
                    outline_key_id=result.get("key_id", ""),
                    access_url=result.get("access_url", ""),
                    created_at=now,
                    uuid=None,
                    last_seen_bytes=0
                )
                db.add(client_key)
        
        elif server.type in ["hysteria2", "hysteria2_python"]:
            rand_str = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
            password = f"{client.name}_{rand_str}"
            
            if server.type == "hysteria2":
                result = await hysteria2.express_create_user(server, client.name, password)
                if result and result.get("password"):
                    password = result.get("password")
                else:
                    await hysteria2.flask_add_user(server, client.name, password)
            else:
                await hysteria2.flask_add_user(server, client.name, password)
            
            raw_host_port = server.api_url.replace('https://', '').replace('http://', '').rstrip('/').split('/')[0]
            if ':' in raw_host_port:
                parsed_host, parsed_port = raw_host_port.split(':')[0], raw_host_port.split(':')[1]
            else:
                parsed_host, parsed_port = raw_host_port, "10443"
                
            host = server.external_domain or parsed_host
            port = server.external_port or int(parsed_port)
            
            access_url = f"hy2://{password}@{host}:{port}/?security=tls&sni={host}#{server.name} - {client.name}"
            
            client_key = ClientKey(
                id=key_id,
                client_id=client.id,
                server_id=server.id,
                outline_key_id=password,
                access_url=access_url,
                created_at=now,
                uuid=None,
                last_seen_bytes=0
            )
            db.add(client_key)
        
        elif server.type == "3x-ui":
            client_uuid = generate_uuid()
            sub_id = generate_sub_id()
            
            from app.services.three_xui import add_3xui_client
            access_url = await add_3xui_client(server, client, client_uuid, sub_id)
            if access_url:
                client_key = ClientKey(
                    id=key_id,
                    client_id=client.id,
                    server_id=server.id,
                    outline_key_id=sub_id,
                    access_url=access_url,
                    created_at=now,
                    uuid=client_uuid,
                    last_seen_bytes=0
                )
                db.add(client_key)
    
    db.commit()

async def delete_client_keys(client: Client, db: Session):
    keys = db.query(ClientKey).filter(ClientKey.client_id == client.id).all()
    servers = {s.id: s for s in db.query(Server).all()}
    
    for k in keys:
        server = servers.get(k.server_id)
        if not server:
            continue
        
        if server.type == "outline":
            await outline.delete_key(server, k.outline_key_id)
        elif server.type in ["hysteria2", "hysteria2_python"]:
            if server.type == "hysteria2":
                del_res = await hysteria2.express_delete_user(server, k.outline_key_id)
                if not del_res:
                    await hysteria2.flask_delete_user(server, k.outline_key_id)
            else:
                await hysteria2.flask_delete_user(server, k.outline_key_id)
        elif server.type == "3x-ui":
            if k.uuid:
                from app.services.three_xui import delete_3xui_client
                await delete_3xui_client(server, k.uuid)
        
        db.delete(k)
    
    db.commit()

async def delete_server_keys(server: Server, db: Session):
    keys = db.query(ClientKey).filter(ClientKey.server_id == server.id).all()
    
    for k in keys:
        if server.type == "outline":
            await outline.delete_key(server, k.outline_key_id)
        elif server.type in ["hysteria2", "hysteria2_python"]:
            if server.type == "hysteria2":
                await hysteria2.express_delete_user(server, k.outline_key_id)
            else:
                await hysteria2.flask_delete_user(server, k.outline_key_id)
        elif server.type == "3x-ui":
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        server.api_url,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as resp:
                        if resp.status == 200:
                            html = await resp.text()
                            csrf_match = re.search(r'csrfToken.*?"([^"]+)"', html)
                            if csrf_match:
                                csrf_token = csrf_match.group(1)
                                
                                async with session.post(
                                    server.api_url + "/login",
                                    data={"username": server.username, "password": server.password},
                                    timeout=aiohttp.ClientTimeout(total=5),
                                    ssl=False
                                ) as login_resp:
                                    if login_resp.status == 200:
                                        if k.uuid:
                                            async with session.post(
                                                server.api_url + f"/panel/api/inbounds/{server.inbound_id}/delClient/{k.uuid}",
                                                timeout=aiohttp.ClientTimeout(total=5),
                                                ssl=False
                                            ) as del_resp:
                                                pass
            except Exception:
                pass
        
        db.delete(k)
    
    db.commit()

async def block_client_keys(client: Client, db: Session):
    keys = db.query(ClientKey).filter(ClientKey.client_id == client.id).all()
    servers = {s.id: s for s in db.query(Server).all()}
    
    for k in keys:
        server = servers.get(k.server_id)
        if not server:
            continue
        
        if server.type == "outline":
            await outline.set_data_limit(server, k.outline_key_id, 1)
        elif server.type in ["hysteria2", "hysteria2_python"]:
            if server.type == "hysteria2":
                del_res = await hysteria2.express_delete_user(server, k.outline_key_id)
                if not del_res:
                    await hysteria2.flask_delete_user(server, k.outline_key_id)
            else:
                await hysteria2.flask_delete_user(server, k.outline_key_id)
        elif server.type == "3x-ui":
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        server.api_url,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as resp:
                        if resp.status == 200:
                            html = await resp.text()
                            csrf_match = re.search(r'csrfToken.*?"([^"]+)"', html)
                            if csrf_match:
                                csrf_token = csrf_match.group(1)
                                
                                async with session.post(
                                    server.api_url + "/login",
                                    data={"username": server.username, "password": server.password},
                                    timeout=aiohttp.ClientTimeout(total=5),
                                    ssl=False
                                ) as login_resp:
                                    if login_resp.status == 200:
                                        async with session.get(
                                            server.api_url + f"/panel/api/inbounds/get/{server.inbound_id}",
                                            timeout=aiohttp.ClientTimeout(total=5),
                                            ssl=False
                                        ) as get_resp:
                                            if get_resp.status == 200:
                                                data = await get_resp.json()
                                                if data.get("success"):
                                                    inbound = data.get("obj", {})
                                                    settings = json.loads(inbound.get("settings", "{}"))
                                                    clients_list = settings.get("clients", [])
                                                    for c in clients_list:
                                                        if c.get("id") == k.uuid:
                                                            c["enable"] = False
                                                            break
                                                    settings["clients"] = clients_list
                                                    inbound["settings"] = json.dumps(settings)
                                                    
                                                    async with session.post(
                                                        server.api_url + f"/panel/api/inbounds/update/{server.inbound_id}",
                                                        json=inbound,
                                                        timeout=aiohttp.ClientTimeout(total=5),
                                                        ssl=False
                                                    ) as update_resp:
                                                        pass
            except Exception:
                pass

async def unblock_client_keys(client: Client, db: Session):
    keys = db.query(ClientKey).filter(ClientKey.client_id == client.id).all()
    servers = {s.id: s for s in db.query(Server).all()}
    
    for k in keys:
        server = servers.get(k.server_id)
        if not server:
            continue
        
        if server.type == "outline":
            await outline.remove_data_limit(server, k.outline_key_id)
        elif server.type in ["hysteria2", "hysteria2_python"]:
            if server.type == "hysteria2":
                await hysteria2.express_update_user(server, k.outline_key_id, client.name, k.outline_key_id, 30)
            else:
                await hysteria2.flask_add_user(server, client.name, k.outline_key_id)
        elif server.type == "3x-ui":
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        server.api_url,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as resp:
                        if resp.status == 200:
                            html = await resp.text()
                            csrf_match = re.search(r'csrfToken.*?"([^"]+)"', html)
                            if csrf_match:
                                csrf_token = csrf_match.group(1)
                                
                                async with session.post(
                                    server.api_url + "/login",
                                    data={"username": server.username, "password": server.password},
                                    timeout=aiohttp.ClientTimeout(total=5),
                                    ssl=False
                                ) as login_resp:
                                    if login_resp.status == 200:
                                        async with session.get(
                                            server.api_url + f"/panel/api/inbounds/get/{server.inbound_id}",
                                            timeout=aiohttp.ClientTimeout(total=5),
                                            ssl=False
                                        ) as get_resp:
                                            if get_resp.status == 200:
                                                data = await get_resp.json()
                                                if data.get("success"):
                                                    inbound = data.get("obj", {})
                                                    settings = json.loads(inbound.get("settings", "{}"))
                                                    clients_list = settings.get("clients", [])
                                                    for c in clients_list:
                                                        if c.get("id") == k.uuid:
                                                            c["enable"] = True
                                                            break
                                                    settings["clients"] = clients_list
                                                    inbound["settings"] = json.dumps(settings)
                                                    
                                                    async with session.post(
                                                        server.api_url + f"/panel/api/inbounds/update/{server.inbound_id}",
                                                        json=inbound,
                                                        timeout=aiohttp.ClientTimeout(total=5),
                                                        ssl=False
                                                    ) as update_resp:
                                                        pass
            except Exception:
                pass

async def get_orphan_keys(server: Server, db: Session) -> List[Dict[str, Any]]:
    if server.type == "outline":
        remote_keys = await outline.get_all_keys(server)
        local_key_ids = {k.outline_key_id for k in db.query(ClientKey).filter(ClientKey.server_id == server.id).all()}
        orphans = []
        for rk in remote_keys:
            if rk.get("id") not in local_key_ids:
                orphans.append({
                    "key_id": rk.get("id", ""),
                    "name": rk.get("name", ""),
                    "access_url": rk.get("accessUrl", "")
                })
        return orphans
    return []

async def delete_orphan_keys(server: Server, orphan_ids: List[str], db: Session):
    for key_id in orphan_ids:
        if server.type == "outline":
            await outline.delete_key(server, key_id)

async def fetch_3xui_metrics(server: Server, keys: list) -> Dict[str, int]:
    try:
        async with aiohttp.ClientSession() as session:
            from app.services.three_xui import login_3xui
            api_base = await login_3xui(session, server)
            if not api_base:
                return {}
            
            async with session.get(
                f"{api_base}/panel/api/inbounds/clientTraffics",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if data.get("success"):
                        traffics = {}
                        for item in data.get("obj", []):
                            email = item.get("email", "")
                            sub_id = item.get("subId", "")
                            uuid_val = item.get("id", "")
                            up = item.get("up", 0) or 0
                            down = item.get("down", 0) or 0
                            total = up + down
                            if email: traffics[email] = total
                            if sub_id: traffics[sub_id] = total
                            if uuid_val: traffics[uuid_val] = total
                        return traffics
    except Exception:
        pass
    return {}

async def sync_all_usage(db: Session):
    clients = db.query(Client).filter(Client.status == "active").all()
    servers = {s.id: s for s in db.query(Server).all()}
    
    keys_by_server = {}
    for k in db.query(ClientKey).all():
        if k.server_id not in keys_by_server:
            keys_by_server[k.server_id] = []
        keys_by_server[k.server_id].append(k)
    
    server_metrics = {}
    
    async def fetch_server_metrics(server_id: str, server: Server, keys: list):
        if server.type == "outline":
            metrics = await outline.fetch_metrics(server)
            server_metrics[server_id] = metrics
        elif server.type == "3x-ui":
            metrics = await fetch_3xui_metrics(server, keys)
            server_metrics[server_id] = metrics
        elif server.type in ["hysteria2", "hysteria2_python"]:
            metrics = await hysteria2.fetch_hysteria2_metrics(server)
            server_metrics[server_id] = metrics
    
    tasks = []
    for server_id, keys in keys_by_server.items():
        server = servers.get(server_id)
        if server:
            tasks.append(fetch_server_metrics(server_id, server, keys))
    
    await asyncio.gather(*tasks, return_exceptions=True)
    
    for client in clients:
        client_total = 0
        keys = [k for k in db.query(ClientKey).filter(ClientKey.client_id == client.id).all()]
        
        for k in keys:
            metrics = server_metrics.get(k.server_id, {})
            user_metric = metrics.get(k.outline_key_id)
            if user_metric is None:
                user_metric = metrics.get(client.name, 0)
                
            if isinstance(user_metric, dict):
                current_bytes = int(user_metric.get("bytes", 0) or 0)
                if user_metric.get("is_online"):
                    client.last_seen = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                elif user_metric.get("last_seen"):
                    client.last_seen = user_metric.get("last_seen")
            else:
                current_bytes = int(user_metric or 0)
            
            if current_bytes < k.last_seen_bytes * 0.9:
                delta = current_bytes
            else:
                delta = max(0, current_bytes - k.last_seen_bytes)
            
            k.last_seen_bytes = current_bytes
            client_total += delta
            
            # If server reports cumulative usage higher than stored, sync directly
            if current_bytes > client.total_usage_bytes:
                client.total_usage_bytes = current_bytes
        
        if client_total > 0:
            client.total_usage_bytes += client_total
            if not client.last_seen:
                client.last_seen = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        
        if client.data_limit_gb and client.total_usage_bytes >= client.data_limit_gb * 1024 * 1024 * 1024:
            client.status = "disabled"
            await block_client_keys(client, db)
    
    db.commit()

async def check_all_expiry(db: Session):
    now = datetime.utcnow().isoformat()
    expired_clients = db.query(Client).filter(
        Client.status == "active",
        Client.expiry_date <= now
    ).all()
    
    for client in expired_clients:
        client.status = "expired"
        await block_client_keys(client, db)
    
    db.commit()
