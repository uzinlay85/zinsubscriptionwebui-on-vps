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
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
import logging

logger = logging.getLogger(__name__)

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
    if not servers:
        return
        
    now = datetime.now(timezone.utc).isoformat()
    from app.services.geo import get_flag_emoji

    # Step 1: Query pre-existing keys for target servers without deleting them yet
    old_keys_map = {}
    for s in servers:
        old_keys_map[s.id] = db.query(ClientKey).filter(
            ClientKey.client_id == client.id,
            ClientKey.server_id == s.id
        ).all()

    # Step 2: Concurrently create new keys for each server (pure async network operations)
    async def _create_for_server(server: Server) -> tuple:
        keys_to_add = []
        key_id = generate_id()
        flag = get_flag_emoji(server.country_code)
        
        try:
            if server.type == "outline":
                result = await outline.create_key(server, client.name)
                if result:
                    raw_url = result.get("access_url", "")
                    access_url = f"{raw_url.split('#')[0]}#{flag} {server.name} - {client.name}" if raw_url else ""
                    client_key = ClientKey(
                        id=key_id,
                        client_id=client.id,
                        server_id=server.id,
                        outline_key_id=result.get("key_id", ""),
                        access_url=access_url,
                        created_at=now,
                        uuid=None,
                        last_seen_bytes=0
                    )
                    keys_to_add.append(client_key)
            
            elif server.type in ["hysteria2", "hysteria2_python"]:
                # Pre-clean any existing user with client.name or previous password on remote Hysteria2 server
                try:
                    old_keys_for_server = old_keys_map.get(server.id, [])
                    for ok in old_keys_for_server:
                        if ok.outline_key_id:
                            await hysteria2.express_delete_user(server, ok.remote_id or ok.outline_key_id)
                            await hysteria2.flask_delete_user(server, ok.outline_key_id, ok.remote_username or client.name)
                    # Also purge by username directly to guarantee no duplicate
                    await hysteria2.express_delete_user(server, client.name)
                    await hysteria2.flask_delete_user(server, "", client.name)
                except Exception as purge_err:
                    logger.debug(f"Pre-creation purge note for {client.name}: {purge_err}")

                rand_str = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
                password = f"{client.name}_{rand_str}"
                
                added = False
                remote_id = None
                remote_username = client.name
                if server.type == "hysteria2":
                    result = await hysteria2.express_create_user(server, client.name, password)
                    if result and result.get("password"):
                        password = result.get("password")
                        remote_id = result.get("user_id") or password
                        remote_username = result.get("username") or client.name
                        added = True
                    else:
                        added = await hysteria2.flask_add_user(server, client.name, password)
                        remote_id = password
                        remote_username = client.name
                else:
                    added = await hysteria2.flask_add_user(server, client.name, password)
                    remote_id = password
                    remote_username = client.name
                
                if added:
                    access_url = hysteria2.build_hysteria2_access_url(server, client.name, password, flag)
                    
                    client_key = ClientKey(
                        id=key_id,
                        client_id=client.id,
                        server_id=server.id,
                        outline_key_id=password,
                        remote_id=remote_id,
                        remote_username=remote_username,
                        access_url=access_url,
                        created_at=now,
                        uuid=None,
                        last_seen_bytes=0
                    )
                    keys_to_add.append(client_key)
                else:
                    logger.error(f"Hysteria2: Failed to add client {client.name} to server {server.name}")
            
            elif server.type == "3x-ui":
                client_uuid = generate_uuid()
                sub_id = generate_sub_id()
                
                from app.services.three_xui import add_3xui_client_all_inbounds
                inbound_keys = await add_3xui_client_all_inbounds(server, client, client_uuid, sub_id)
                for ib_info in inbound_keys:
                    raw_access_url = ib_info.get("access_url", "")
                    ib_id = ib_info.get("inbound_id", "")
                    if raw_access_url:
                        if "#" in raw_access_url:
                            base_acc, rem = raw_access_url.split('#', 1)
                            if flag not in rem:
                                access_url = f"{base_acc}#{flag} {rem}"
                            else:
                                access_url = raw_access_url
                        else:
                            access_url = f"{raw_access_url}#{flag} {server.name} - {client.name}"

                        client_key = ClientKey(
                            id=generate_id(),
                            client_id=client.id,
                            server_id=server.id,
                            outline_key_id=f"{sub_id}:{ib_id}" if ib_id else sub_id,
                            access_url=access_url,
                            created_at=now,
                            uuid=client_uuid,
                            last_seen_bytes=0
                        )
                        keys_to_add.append(client_key)
        except Exception as e:
            logger.error(f"Error creating key for server {server.name}: {e}")
                        
        return server, keys_to_add

    # Execute network calls concurrently
    results = await asyncio.gather(*[_create_for_server(s) for s in servers], return_exceptions=True)
    
    # Step 3: For servers that succeeded, add new keys & safely revoke/delete old keys
    for res in results:
        if isinstance(res, tuple):
            server, new_keys = res
            if new_keys:
                # Add newly created keys
                for nk in new_keys:
                    db.add(nk)
                
                # Revoke and delete old keys for this server only after new keys exist
                old_keys = old_keys_map.get(server.id, [])
                deleted_uuids = set()
                deleted_key_ids = set()
                
                for ok in old_keys:
                    if server.type == "outline" and ok.outline_key_id and ok.outline_key_id not in deleted_key_ids:
                        deleted_key_ids.add(ok.outline_key_id)
                        try:
                            await outline.delete_key(server, ok.outline_key_id)
                        except Exception as e:
                            logger.error(f"Error revoking old Outline key {ok.outline_key_id}: {e}")
                    elif server.type in ["hysteria2", "hysteria2_python"] and ok.outline_key_id and ok.outline_key_id not in deleted_key_ids:
                        deleted_key_ids.add(ok.outline_key_id)
                        try:
                            remote_id = ok.remote_id or ok.outline_key_id
                            del_res = await hysteria2.express_delete_user(server, str(remote_id))
                            if not del_res and ok.outline_key_id:
                                del_res = await hysteria2.express_delete_user(server, str(ok.outline_key_id))
                            if not del_res:
                                await hysteria2.flask_delete_user(server, ok.outline_key_id, ok.remote_username or client.name)
                        except Exception as e:
                            logger.error(f"Error revoking old Hysteria2 key {ok.outline_key_id}: {e}")
                    elif server.type == "3x-ui" and ok.uuid and ok.uuid not in deleted_uuids:
                        deleted_uuids.add(ok.uuid)
                        try:
                            from app.services.three_xui import delete_3xui_client
                            await delete_3xui_client(server, ok.uuid)
                        except Exception as e:
                            logger.error(f"Error revoking old 3x-ui client {ok.uuid}: {e}")
                    
                    db.delete(ok)
            else:
                logger.warning(f"Skipping old key deletion on server {server.name} because new key creation did not return keys.")
        elif isinstance(res, Exception):
            logger.error(f"Exception during server key generation: {res}")

    try:
        db.commit()
        from app.routers.sub import invalidate_sub_cache
        invalidate_sub_cache(client.sub_token)
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to commit key changes for client {client.name}: {e}")
        raise e

async def delete_client_keys(client: Client, db: Session):
    keys = db.query(ClientKey).filter(ClientKey.client_id == client.id).all()
    servers = {s.id: s for s in db.query(Server).all()}
    
    deleted_uuids = set()
    deleted_key_ids = set()
    
    for k in keys:
        server = servers.get(k.server_id)
        if not server:
            db.delete(k)
            continue
        
        if server.type == "outline" and k.outline_key_id and k.outline_key_id not in deleted_key_ids:
            deleted_key_ids.add(k.outline_key_id)
            try:
                await outline.delete_key(server, k.outline_key_id)
            except Exception:
                pass
        elif server.type in ["hysteria2", "hysteria2_python"] and k.outline_key_id and k.outline_key_id not in deleted_key_ids:
            deleted_key_ids.add(k.outline_key_id)
            try:
                remote_id = k.remote_id or k.outline_key_id
                username = k.remote_username or client.name
                del_res = await hysteria2.express_delete_user(server, str(remote_id))
                if not del_res and username != str(remote_id):
                    del_res = await hysteria2.express_delete_user(server, username)
                if not del_res:
                    await hysteria2.flask_delete_user(server, k.outline_key_id, username)
            except Exception:
                pass
        elif server.type == "3x-ui" and k.uuid and k.uuid not in deleted_uuids:
            deleted_uuids.add(k.uuid)
            try:
                from app.services.three_xui import delete_3xui_client
                await delete_3xui_client(server, k.uuid)
            except Exception:
                pass
        
        db.delete(k)
    
    db.commit()
    try:
        from app.routers.sub import invalidate_sub_cache
        invalidate_sub_cache(client.sub_token)
    except Exception:
        pass

async def delete_single_client_key(key: ClientKey, client: Client, db: Session):
    server = db.query(Server).filter(Server.id == key.server_id).first()
    if server:
        if server.type == "outline" and key.outline_key_id:
            try:
                await outline.delete_key(server, key.outline_key_id)
            except Exception as e:
                logger.error(f"Error revoking Outline key {key.outline_key_id}: {e}")
        elif server.type in ["hysteria2", "hysteria2_python"] and key.outline_key_id:
            try:
                remote_id = key.remote_id or key.outline_key_id
                username = key.remote_username or client.name
                del_res = await hysteria2.express_delete_user(server, str(remote_id))
                if not del_res and username != str(remote_id):
                    del_res = await hysteria2.express_delete_user(server, username)
                if not del_res:
                    await hysteria2.flask_delete_user(server, key.outline_key_id, username)
            except Exception as e:
                logger.error(f"Error revoking Hysteria2 key {key.outline_key_id}: {e}")
        elif server.type == "3x-ui":
            if key.uuid:
                try:
                    from app.services.three_xui import delete_3xui_client
                    await delete_3xui_client(server, key.uuid)
                except Exception as e:
                    logger.error(f"Error revoking 3x-ui client {key.uuid}: {e}")
    
    db.delete(key)
    db.commit()
    try:
        from app.routers.sub import invalidate_sub_cache
        invalidate_sub_cache(client.sub_token)
    except Exception:
        pass

async def delete_server_keys(server: Server, db: Session):
    # 1. For Hysteria2, purge ALL users from the remote server first
    if server.type in ["hysteria2", "hysteria2_python"]:
        try:
            await hysteria2.delete_all_remote_users(server)
        except Exception as e:
            logger.error(f"Error purging all remote Hysteria2 users on {server.name}: {e}")
    # 2. For 3x-ui, purge all clients from all inbounds on the remote server
    elif server.type == "3x-ui":
        try:
            from app.services.three_xui import delete_all_3xui_clients
            await delete_all_3xui_clients(server)
        except Exception as e:
            logger.error(f"Error purging all remote 3x-ui clients on {server.name}: {e}")

    keys = db.query(ClientKey).filter(ClientKey.server_id == server.id).all()
    
    # Run remote key cleanups in parallel with graceful exception handling
    tasks = []
    if server.type == "outline":
        unique_key_ids = list(set([k.outline_key_id for k in keys if k.outline_key_id]))
        for kid in unique_key_ids:
            tasks.append(outline.delete_key(server, kid))
    elif server.type == "3x-ui":
        unique_uuids = list(set([k.uuid for k in keys if k.uuid]))
        from app.services.three_xui import delete_3xui_client
        for u in unique_uuids:
            tasks.append(delete_3xui_client(server, u))
    
    if tasks:
        try:
            await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as e:
            logger.warning(f"Error during parallel key deletions for {server.name}: {e}")
    
    for k in keys:
        db.delete(k)
    
    db.commit()
    try:
        from app.routers.sub import invalidate_sub_cache
        invalidate_sub_cache()
    except Exception:
        pass

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
                remote_id = k.remote_id or k.outline_key_id
                del_res = await hysteria2.express_delete_user(server, remote_id)
                if not del_res:
                    await hysteria2.flask_delete_user(server, k.outline_key_id)
            else:
                await hysteria2.flask_delete_user(server, k.remote_id or k.outline_key_id)
        elif server.type == "3x-ui":
            if k.uuid:
                try:
                    from app.services.three_xui import set_3xui_client_enabled
                    await set_3xui_client_enabled(server, k.uuid, False)
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
            # Re-enable/update the existing remote user when the provider supports
            # it; only fall back to create for legacy records/providers.
            remote_id = k.remote_id or k.outline_key_id
            updated = False
            if server.type == "hysteria2" and k.remote_id:
                updated = await hysteria2.express_update_user(
                    server,
                    remote_id,
                    k.remote_username or client.name,
                    k.outline_key_id,
                    expiry_days=0,
                )
            if not updated:
                if server.type == "hysteria2":
                    updated_result = await hysteria2.express_create_user(
                        server, client.name, k.outline_key_id
                    )
                    updated = bool(updated_result)
                    if updated_result and updated_result.get("user_id"):
                        k.remote_id = str(updated_result["user_id"])
                        k.remote_username = updated_result.get("username") or client.name
                if not updated:
                    updated = await hysteria2.flask_add_user(
                        server, client.name, k.outline_key_id
                    )
                    if updated and server.type == "hysteria2_python":
                        k.remote_id = k.outline_key_id
        elif server.type == "3x-ui":
            if k.uuid:
                try:
                    from app.services.three_xui import set_3xui_client_enabled
                    await set_3xui_client_enabled(server, k.uuid, True)
                except Exception:
                    pass

    # Some callers commit before invoking this function (renew/reset), so persist
    # any refreshed provider identifiers here as well.
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to persist unblock state: {e}")

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
            from app.services.three_xui import login_3xui, build_url, get_ssl_setting, DEFAULT_TIMEOUT
            api_base, headers = await login_3xui(session, server)
            if not api_base:
                return {}
            
            traffics_url = build_url(api_base, "panel/api/inbounds/clientTraffics")
            ssl_verify = get_ssl_setting(server)
            async with session.get(
                traffics_url,
                headers=headers,
                timeout=DEFAULT_TIMEOUT,
                ssl=ssl_verify
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if data.get("success"):
                        traffics = {}
                        for item in data.get("obj", []):
                            email = item.get("email", "")
                            sub_id = item.get("subId", "")
                            uuid_val = item.get("id", "")
                            inbound_id = item.get("inboundId")
                            up = item.get("up", 0) or 0
                            down = item.get("down", 0) or 0
                            total = up + down
                            if email:
                                traffics[email] = (traffics.get(email, 0) + total)
                                if inbound_id is not None:
                                    traffics[f"{email}:{inbound_id}"] = total
                            if sub_id:
                                traffics[sub_id] = (traffics.get(sub_id, 0) + total)
                                if inbound_id is not None:
                                    traffics[f"{sub_id}:{inbound_id}"] = total
                            if uuid_val:
                                traffics[uuid_val] = (traffics.get(uuid_val, 0) + total)
                                if inbound_id is not None:
                                    traffics[f"{uuid_val}:{inbound_id}"] = total
                        return traffics
    except Exception:
        pass
    return {}

async def fetch_server_metrics_single(server: Server, keys: list = None) -> Dict[str, Any]:
    """Centralized metrics fetch for any server type (Outline, 3x-ui, Hysteria2)."""
    try:
        if server.type == "outline":
            return await outline.fetch_metrics(server)
        elif server.type == "3x-ui":
            return await fetch_3xui_metrics(server, keys or [])
        elif server.type in ["hysteria2", "hysteria2_python"]:
            return await hysteria2.fetch_hysteria2_metrics(server)
    except Exception as e:
        logger.error(f"fetch_server_metrics_single failed for server {server.name}: {e}")
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
    failed_servers = set()  # Track servers that failed to respond
    
    async def fetch_server_metrics(server_id: str, server: Server, keys: list):
        try:
            metrics = await fetch_server_metrics_single(server, keys)
            server_metrics[server_id] = metrics
        except Exception as e:
            failed_servers.add(server_id)
            logger.error(f"[sync] Server {server_id} fetch failed: {e}")
    
    tasks = []
    for server_id, keys in keys_by_server.items():
        server = servers.get(server_id)
        if server:
            tasks.append(fetch_server_metrics(server_id, server, keys))
    
    await asyncio.gather(*tasks, return_exceptions=True)
    
    now_utc_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    
    for client in clients:
        client_delta = 0
        keys = [k for k in db.query(ClientKey).filter(ClientKey.client_id == client.id).all()]
        
        for k in keys:
            # Skip keys on servers that failed to respond — don't touch last_seen_bytes
            if k.server_id in failed_servers:
                continue
            metrics = server_metrics.get(k.server_id, {})
            user_metric = None
            server = servers.get(k.server_id)
            if server and server.type == "3x-ui":
                # For 3x-ui, match specific inbound key to avoid double-counting across inbounds
                if k.outline_key_id and k.outline_key_id in metrics:
                    user_metric = metrics.get(k.outline_key_id)
                elif k.uuid and k.outline_key_id and ":" in k.outline_key_id:
                    inbound_id_part = k.outline_key_id.split(':')[-1]
                    uuid_inbound_key = f"{k.uuid}:{inbound_id_part}"
                    if uuid_inbound_key in metrics:
                        user_metric = metrics.get(uuid_inbound_key)
                elif k.uuid and k.uuid in metrics and ":" not in (k.outline_key_id or ""):
                    # Fallback to UUID only if outline_key_id has no specific inbound ID
                    user_metric = metrics.get(k.uuid)
            else:
                # Standard lookup for Outline and Hysteria
                if k.outline_key_id and k.outline_key_id in metrics:
                    user_metric = metrics.get(k.outline_key_id)
                elif k.uuid and k.uuid in metrics:
                    user_metric = metrics.get(k.uuid)
            is_online = False
            last_seen_str = None
            if isinstance(user_metric, dict):
                current_bytes = int(user_metric.get("bytes", 0) or 0)
                is_online = bool(user_metric.get("is_online", False))
                last_seen_str = user_metric.get("last_seen")
                if is_online:
                    client.last_seen = now_utc_str
                    last_seen_str = now_utc_str
                elif last_seen_str:
                    client.last_seen = last_seen_str
            elif user_metric is not None:
                current_bytes = int(user_metric or 0)
            else:
                # Server returned no metrics for this key — skip this sync cycle
                continue
            
            # Save key-level status and last active time
            k.is_online = is_online
            if last_seen_str:
                k.last_seen = last_seen_str
            
            # Initial baseline capture for brand new key or reset key
            if k.last_seen_bytes is None or k.last_seen_bytes <= 0:
                k.last_seen_bytes = current_bytes
                delta = 0
            elif current_bytes < k.last_seen_bytes:
                # Calculate drop percentage to distinguish real reset from rolling window
                drop_pct = (k.last_seen_bytes - current_bytes) / k.last_seen_bytes if k.last_seen_bytes > 0 else 0
                if drop_pct > 0.5:
                    delta = current_bytes
                    k.last_seen_bytes = current_bytes
                    logger.info(f"[sync] Key {k.id[:8]}: counter RESET detected (drop {drop_pct:.0%}), delta={delta}")
                else:
                    delta = 0
                    k.last_seen_bytes = current_bytes
                    logger.info(f"[sync] Key {k.id[:8]}: minor counter drop (drop {drop_pct:.0%}), skipping delta")
            else:
                delta = current_bytes - k.last_seen_bytes
                k.last_seen_bytes = current_bytes
            
            # Sanity check: cap per-key delta to 10GB per sync cycle
            MAX_DELTA_PER_SYNC = 10 * 1024 * 1024 * 1024  # 10 GB
            if delta > MAX_DELTA_PER_SYNC:
                logger.warning(f"[sync] Key {k.id[:8]}: delta {delta/(1024**3):.2f}GB exceeds max, capping to 0")
                delta = 0
                k.last_seen_bytes = current_bytes
            
            client_delta += delta
        
        if client_delta > 0:
            client.total_usage_bytes = (client.total_usage_bytes or 0) + client_delta
            client.last_seen = now_utc_str
        
        # Check quota limit and disable only when truly exceeded
        limit_bytes = int(client.data_limit_gb * 1024 * 1024 * 1024) if client.data_limit_gb else 0
        if limit_bytes > 0 and (client.total_usage_bytes or 0) >= limit_bytes:
            if client.status == "active":
                client.status = "disabled"
                await block_client_keys(client, db)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to commit sync_all_usage: {e}")

async def check_all_expiry(db: Session):
    now = datetime.now(timezone.utc).isoformat()
    expired_clients = db.query(Client).filter(
        Client.status == "active",
        Client.expiry_date <= now
    ).all()
    
    for client in expired_clients:
        client.status = "expired"
        await block_client_keys(client, db)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to commit check_all_expiry: {e}")
