import asyncio
from app.database import SessionLocal
from app.models import Server
from app.services.three_xui import login_3xui, build_url, get_ssl_setting, DEFAULT_TIMEOUT
import aiohttp

async def check_inbounds():
    db = SessionLocal()
    try:
        # Get all 3x-ui servers
        servers = db.query(Server).filter(Server.type == "3x-ui").all()
        if not servers:
            print("No 3x-ui server found in database.")
            return
            
        for server in servers:
            print(f"\n==================================================================")
            print(f"Connecting to server: {server.name} ({server.api_url})...")
            jar = aiohttp.CookieJar(unsafe=True)
            async with aiohttp.ClientSession(cookie_jar=jar) as session:
                api_base, headers = await login_3xui(session, server)
                if not api_base:
                    print(f"Failed to login to 3x-ui server {server.name}.")
                    continue
                    
                list_url = build_url(api_base, "panel/api/inbounds/list")
                ssl_verify = get_ssl_setting(server)
                async with session.get(
                    list_url,
                    headers=headers,
                    timeout=DEFAULT_TIMEOUT,
                    ssl=ssl_verify
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get("success"):
                            inbounds = data.get("obj", [])
                            print(f"Found {len(inbounds)} inbounds on {server.name}:")
                            for idx, inb in enumerate(inbounds, 1):
                                print(f"\n  --- Inbound #{idx} ---")
                                print(f"    ID: {inb.get('id')}")
                                print(f"    Remark: {inb.get('remark')}")
                                print(f"    Protocol: {inb.get('protocol')}")
                                print(f"    Port: {inb.get('port')}")
                                print(f"    Stream Settings: {inb.get('streamSettings')}")
                        else:
                            print(f"API call failed for {server.name}:", data)
                    else:
                        print(f"Failed to fetch inbounds for {server.name}. Status: {resp.status}")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(check_inbounds())
