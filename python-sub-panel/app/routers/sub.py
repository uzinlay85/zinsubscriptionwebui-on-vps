from fastapi import APIRouter, Request, Response, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Client, ClientKey, Server, Setting
from typing import Dict, Optional
import base64
import re
from datetime import datetime
import aiohttp

router = APIRouter()

def get_brand_name(db: Session) -> str:
    app_name_setting = db.query(Setting).filter(Setting.key == "app_name").first()
    panel_name_setting = db.query(Setting).filter(Setting.key == "panel_name").first()
    
    if app_name_setting and app_name_setting.value:
        return app_name_setting.value
    if panel_name_setting and panel_name_setting.value:
        return panel_name_setting.value
    return "VPN Panel"

@router.get("/{token}")
async def get_subscription(request: Request, token: str, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.sub_token == token).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    brand = get_brand_name(db)
    creation_date = datetime.fromisoformat(client.created_at.replace("Z", "+00:00")).strftime("%d.%m.%Y")
    profile_title = f"{client.name} - {brand} [{creation_date}]"
    
    userinfo_parts = ["upload=0"]
    
    if client.status != "active":
        if client.status == "expired":
            expiry_str = ""
            if client.expiry_date:
                expiry_dt = datetime.fromisoformat(client.expiry_date.replace("Z", "+00:00"))
                expiry_str = expiry_dt.strftime("%Y-%m-%d")
            dummy_node = f"❌ Subscription Expired: {expiry_str}\n"
            content = dummy_node + "ss://YWVzLTI1Ni1nY2064p2k77iP566h44GX44KL44CC@dummy.invalid:8388#Expired"
            encoded = base64.b64encode(content.encode()).decode()
            return Response(
                content=encoded,
                media_type="text/plain",
                headers={
                    "profile-title": profile_title,
                    "Subscription-Userinfo": "upload=0; download=0; total=0; expire=0",
                    "Cache-Control": "no-store"
                }
            )
        else:
            content = f"🚫 Account {client.status.title()}\nss://YWVzLTI1Ni1nY2064p2k77iP566h44GX44KL44CC@dummy.invalid:8388#{client.status.title()}"
            encoded = base64.b64encode(content.encode()).decode()
            return Response(
                content=encoded,
                media_type="text/plain",
                headers={
                    "profile-title": profile_title,
                    "Subscription-Userinfo": "upload=0; download=0; total=0; expire=0",
                    "Cache-Control": "no-store"
                }
            )
    
    keys = db.query(ClientKey).filter(ClientKey.client_id == client.id).all()
    servers = {s.id: s for s in db.query(Server).all()}
    
    nodes = []
    total_usage = client.total_usage_bytes
    data_limit = client.data_limit_gb * 1024 * 1024 * 1024 if client.data_limit_gb else (1000 * 1024 * 1024 * 1024)
    
    userinfo_parts.append(f"download={total_usage}")
    userinfo_parts.append(f"total={data_limit}")
    
    if client.expiry_date:
        expiry_dt = datetime.fromisoformat(client.expiry_date.replace("Z", "+00:00"))
        userinfo_parts.append(f"expire={int(expiry_dt.timestamp())}")
    else:
        userinfo_parts.append("expire=0")
    
    nodes.append(f"📊 Usage: {total_usage / (1024*1024*1024):.2f} GB / {client.data_limit_gb or 'Unlimited'} GB")
    
    if client.expiry_date:
        expiry_dt = datetime.fromisoformat(client.expiry_date.replace("Z", "+00:00"))
        now = datetime.utcnow().replace(tzinfo=expiry_dt.tzinfo)
        days_left = (expiry_dt - now).days
        if days_left >= 0:
            nodes.append(f"⏳ Expire: {expiry_dt.strftime('%Y-%m-%d')} ({days_left} Days Left)")
        else:
            nodes.append(f"❌ Expired: {expiry_dt.strftime('%Y-%m-%d')}")
    
    for k in keys:
        server = servers.get(k.server_id)
        if not server:
            continue
        
        if server.type == "outline":
            nodes.append(k.access_url)
        elif server.type in ["hysteria2", "hysteria2_python"]:
            nodes.append(k.access_url)
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
                                            nodes.append(modified)
                                        else:
                                            nodes.append(link)
                                continue
                except Exception:
                    pass
            
            if k.uuid and server.external_domain and server.external_port:
                host = server.external_domain
                port = server.external_port
                sni = server.external_domain
                params = f"encryption=none&security=tls&sni={sni}&fp=chrome&type=tcp&headerType=none"
                custom_link = f"vless://{k.uuid}@{host}:{port}?{params}#{server.name} - {client.name}"
                nodes.append(custom_link)
            elif k.access_url:
                nodes.append(k.access_url)
    
    content = "\n".join(nodes)
    
    format_type = request.query_params.get("format", "").lower()
    
    if format_type == "text":
        return Response(
            content=content,
            media_type="text/plain",
            headers={
                "profile-title": profile_title,
                "Subscription-Userinfo": "; ".join(userinfo_parts),
                "Cache-Control": "no-store"
            }
        )
    
    encoded = base64.b64encode(content.encode()).decode()
    return Response(
        content=encoded,
        media_type="text/plain",
        headers={
            "profile-title": profile_title,
            "Subscription-Userinfo": "; ".join(userinfo_parts),
            "Cache-Control": "no-store"
        }
    )
