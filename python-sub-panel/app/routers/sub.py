from fastapi import APIRouter, Request, Response, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Client, ClientKey, Server, Setting
from typing import Dict, Optional, Tuple
import base64
import re
import time
from datetime import datetime
import aiohttp

router = APIRouter()

# In-memory RAM cache for subscription strings (TTL: 30s)
_SUB_CACHE: Dict[str, Tuple[float, str, dict]] = {}
CACHE_TTL = 30

def get_cached_sub(token: str) -> Optional[Tuple[str, dict]]:
    item = _SUB_CACHE.get(token)
    if item:
        ts, content, headers = item
        if time.time() - ts < CACHE_TTL:
            return content, headers
        _SUB_CACHE.pop(token, None)
    return None

def set_cached_sub(token: str, content: str, headers: dict):
    _SUB_CACHE[token] = (time.time(), content, headers)

def invalidate_sub_cache(token: Optional[str] = None):
    if token:
        _SUB_CACHE.pop(token, None)
    else:
        _SUB_CACHE.clear()

def get_brand_name(db: Session) -> str:
    app_name_setting = db.query(Setting).filter(Setting.key == "app_name").first()
    panel_name_setting = db.query(Setting).filter(Setting.key == "panel_name").first()
    
    if app_name_setting and app_name_setting.value:
        return app_name_setting.value
    if panel_name_setting and panel_name_setting.value:
        return panel_name_setting.value
    return "VPN Panel"

def safe_parse_iso(date_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None

@router.get("/{token}")
async def get_subscription(request: Request, token: str, db: Session = Depends(get_db)):
    cached = get_cached_sub(token)
    if cached:
        content, headers = cached
        return Response(content=content, media_type="text/plain", headers=headers)

    client = db.query(Client).filter(Client.sub_token == token).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    brand = get_brand_name(db)
    created_dt = safe_parse_iso(client.created_at)
    creation_date = created_dt.strftime("%d.%m.%Y") if created_dt else "N/A"
    profile_title = f"{client.name} - {brand} [{creation_date}]"
    
    userinfo_parts = ["upload=0"]
    
    now = datetime.utcnow()
    
    # 1. Real-time Expiry Validation
    is_expired = False
    expiry_dt = safe_parse_iso(client.expiry_date)
    if expiry_dt:
        exp_cmp = expiry_dt.replace(tzinfo=None)
        if now > exp_cmp:
            is_expired = True
            
    # 2. Real-time Data Limit Validation
    is_limit_exceeded = False
    if client.data_limit_gb and client.data_limit_gb > 0:
        limit_bytes = int(client.data_limit_gb * 1024 * 1024 * 1024)
        if client.total_usage_bytes >= limit_bytes:
            is_limit_exceeded = True

    # Block access if status is not active, expired, or data limit exceeded
    if client.status != "active" or is_expired or is_limit_exceeded:
        if is_expired and client.status != "expired":
            client.status = "expired"
            db.commit()
            from app.services.vpn_manager import block_client_keys
            await block_client_keys(client, db)
        elif is_limit_exceeded and client.status != "disabled":
            client.status = "disabled"
            db.commit()
            from app.services.vpn_manager import block_client_keys
            await block_client_keys(client, db)
            
        status_label = "Expired" if is_expired else ("Data Limit Exceeded" if is_limit_exceeded else client.status.title())
        expiry_str = expiry_dt.strftime("%Y-%m-%d") if expiry_dt else "N/A"
        content = f"ss://YWVzLTI1Ni1nY2064p2k77iP566h44GX44KL44CC@dummy.invalid:8388#{status_label} - {expiry_str}"
        encoded = base64.b64encode(content.encode()).decode()
        resp_headers = {
            "profile-title": profile_title,
            "Subscription-Userinfo": f"upload=0; download={client.total_usage_bytes}; total={int(client.data_limit_gb * 1024 * 1024 * 1024) if client.data_limit_gb else 0}; expire={int(expiry_dt.timestamp()) if expiry_dt else 0}",
            "profile-update-interval": "24",
            "Cache-Control": "no-store"
        }
        set_cached_sub(token, encoded, resp_headers)
        return Response(content=encoded, media_type="text/plain", headers=resp_headers)
    
    all_servers = db.query(Server).filter(Server.is_active != False).all()
    existing_key_server_ids = {k.server_id for k in db.query(ClientKey).filter(ClientKey.client_id == client.id).all()}
    missing_server_ids = [s.id for s in all_servers if s.id not in existing_key_server_ids]
    
    if missing_server_ids and client.status == "active":
        from app.services.vpn_manager import generate_keys_for_client
        await generate_keys_for_client(client, missing_server_ids, db)
    
    keys = db.query(ClientKey).filter(ClientKey.client_id == client.id).all()
    servers = {s.id: s for s in all_servers}
    
    nodes = []
    total_usage = client.total_usage_bytes
    data_limit = client.data_limit_gb * 1024 * 1024 * 1024 if client.data_limit_gb else (1000 * 1024 * 1024 * 1024)
    
    userinfo_parts.append(f"download={total_usage}")
    userinfo_parts.append(f"total={data_limit}")
    
    expiry_dt = safe_parse_iso(client.expiry_date)
    if expiry_dt:
        userinfo_parts.append(f"expire={int(expiry_dt.timestamp())}")
    else:
        userinfo_parts.append("expire=0")
    
    from app.services.geo import get_flag_emoji

    def format_node_with_flag(node_url: str, srv: Server, cl_name: str) -> str:
        if not node_url:
            return node_url
        flg = get_flag_emoji(getattr(srv, "country_code", None))
        if "#" in node_url:
            base_u, rem = node_url.split("#", 1)
            if flg not in rem:
                if srv.name in rem:
                    rem = rem.replace(srv.name, f"{flg} {srv.name}", 1)
                else:
                    rem = f"{flg} {rem}"
            return f"{base_u}#{rem}"
        return f"{node_url}#{flg} {srv.name} - {cl_name}"

    for k in keys:
        server = servers.get(k.server_id)
        if not server or server.is_active is False:
            continue
        
        if server.type == "outline":
            url = k.access_url
            if url and url.strip():
                nodes.append(format_node_with_flag(url.strip(), server, client.name))
        elif server.type in ["hysteria2", "hysteria2_python"]:
            if k.access_url and k.access_url.strip():
                nodes.append(format_node_with_flag(k.access_url.strip(), server, client.name))
            else:
                raw_host_port = server.api_url.replace('https://', '').replace('http://', '').rstrip('/').split('/')[0]
                if ':' in raw_host_port:
                    parsed_host, parsed_port = raw_host_port.split(':')[0], raw_host_port.split(':')[1]
                else:
                    parsed_host, parsed_port = raw_host_port, "10443"
                host = server.external_domain or parsed_host
                port = server.external_port or int(parsed_port)
                pwd = k.outline_key_id or f"{client.name}_key"
                flg = get_flag_emoji(getattr(server, "country_code", None))
                fallback_url = f"hy2://{pwd}@{host}:{port}/?security=tls&sni={host}#{flg} {server.name} - {client.name}"
                nodes.append(fallback_url)
        elif server.type == "3x-ui":
            if k.access_url.startswith("3x-ui-sub:"):
                sub_id = k.access_url.replace("3x-ui-sub:", "")
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(
                            f"{server.api_url}/sub/{sub_id}",
                            timeout=aiohttp.ClientTimeout(total=5),
                            ssl=False
                        ) as resp:
                            if resp.status == 200:
                                text = await resp.text()
                                links = text.strip().split("\n")
                                for link in links:
                                    link = link.strip()
                                    if link:
                                        if server.external_domain and server.external_port:
                                            modified = re.sub(r'@([^:]+):\d+', f'@{server.external_domain}:{server.external_port}', link)
                                            modified = re.sub(r'sni=[^&]+', f'sni={server.external_domain}', modified)
                                            nodes.append(format_node_with_flag(modified, server, client.name))
                                        else:
                                            nodes.append(format_node_with_flag(link, server, client.name))
                                continue
                except Exception:
                    pass
            
            if k.uuid and server.external_domain and server.external_port:
                host = server.external_domain
                port = server.external_port
                sni = server.external_domain
                flg = get_flag_emoji(getattr(server, "country_code", None))
                params = f"encryption=none&security=tls&sni={sni}&fp=chrome&type=tcp&headerType=none"
                custom_link = f"vless://{k.uuid}@{host}:{port}?{params}#{flg} {server.name} - {client.name}"
                nodes.append(custom_link)
            elif k.access_url:
                nodes.append(format_node_with_flag(k.access_url, server, client.name))
    
    valid_prefixes = ("vless://", "hy2://", "hysteria2://", "ss://", "vmess://", "trojan://", "tuic://", "wireguard://", "shadowsocks://")
    clean_nodes = [n.strip() for n in nodes if n and n.strip().startswith(valid_prefixes)]
    content = "\n".join(clean_nodes)
    
    format_type = request.query_params.get("format", "").lower()
    
    if format_type == "text":
        return Response(
            content=content,
            media_type="text/plain",
            headers={
                "profile-title": profile_title,
                "Subscription-Userinfo": "; ".join(userinfo_parts),
                "profile-update-interval": "24",
                "Cache-Control": "no-store"
            }
        )
    
    encoded = base64.b64encode(content.encode()).decode()
    resp_headers = {
        "profile-title": profile_title,
        "Subscription-Userinfo": "; ".join(userinfo_parts),
        "profile-update-interval": "24",
        "Cache-Control": "no-store"
    }
    if not format_type:
        set_cached_sub(token, encoded, resp_headers)
    return Response(
        content=encoded,
        media_type="text/plain",
        headers=resp_headers
    )
