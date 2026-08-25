import asyncio
from app.database import SessionLocal
from app.models import Server
from app.services.three_xui import login_3xui, build_url, get_ssl_setting, DEFAULT_TIMEOUT
import aiohttp
import json

async def check_clients():
    db = SessionLocal()
    try:
        # Find the Hong Kong server (either named Bear_Vlesss or similar 3x-ui type)
        servers = db.query(Server).filter(Server.type == "3x-ui").all()
        
        for server in servers:
            print(f"\n=== SERVER: {server.name} ({server.api_url}) ===")
            ssl_verify = get_ssl_setting(server)
            
            jar = aiohttp.CookieJar(unsafe=True)
            async with aiohttp.ClientSession(cookie_jar=jar) as session:
                api_base, headers = await login_3xui(session, server)
                if not api_base:
                    print(f"  Failed to login to {server.name}")
                    continue
                    
                list_url = build_url(api_base, "panel/api/inbounds/list")
                async with session.get(
                    list_url,
                    headers=headers,
                    timeout=DEFAULT_TIMEOUT,
                    ssl=ssl_verify
                ) as resp:
                    if resp.status != 200:
                        print(f"  Failed to fetch inbounds list: HTTP {resp.status}")
                        continue
                        
                    data = await resp.json()
                    if not data.get("success"):
                        print(f"  Failed to fetch inbounds: {data}")
                        continue
                        
                    inbounds = data.get("obj", [])
                    print(f"  Found {len(inbounds)} inbounds:")
                    for ib in inbounds:
                        ib_id = ib.get("id")
                        remark = ib.get("remark")
                        protocol = ib.get("protocol")
                        port = ib.get("port")
                        
                        print(f"\n    Inbound ID {ib_id}: {remark} ({protocol} on port {port})")
                        
                        # Parse settings to see clients
                        settings_raw = ib.get("settings", "{}")
                        try:
                            settings = json.loads(settings_raw) if isinstance(settings_raw, str) else (settings_raw or {})
                        except Exception:
                            settings = {}
                            
                        clients = settings.get("clients", [])
                        print(f"      Clients registered ({len(clients)}):")
                        for c in clients:
                            c_email = c.get("email")
                            c_id = c.get("id") or c.get("password")
                            c_sub = c.get("subId")
                            print(f"        - Email: {c_email} | UUID/Pass: {c_id} | SubID: {c_sub}")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(check_clients())
