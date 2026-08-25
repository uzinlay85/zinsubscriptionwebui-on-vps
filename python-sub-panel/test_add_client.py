import asyncio
import logging
import sys

# Configure logging to print to stdout so we see three_xui.py logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)

from app.database import SessionLocal
from app.models import Server, Client
from app.services.three_xui import login_3xui, build_url, get_ssl_setting, DEFAULT_TIMEOUT
import aiohttp
import json

async def test_add():
    db = SessionLocal()
    try:
        # Find the server vds-vless
        server = db.query(Server).filter(Server.name == "vds-vless").first()
        if not server:
            print("Server vds-vless not found in DB.")
            return
            
        client = db.query(Client).filter(Client.name == "me").first()
        if not client:
            print("Client 'me' not found in DB.")
            return
            
        print(f"\n=== TESTING ADD CLIENT TO: {server.name} ===")
        ssl_verify = get_ssl_setting(server)
        client_uuid = "4fe6318a-c8f5-4d03-8e46-cab979a12801"
        sub_id = "IsRATjpvdpXcttee"
        
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            print("Attempting login...")
            api_base, headers = await login_3xui(session, server)
            if not api_base:
                print("Login failed.")
                return
                
            print(f"Login succeeded! api_base: {api_base}")
            print(f"Authenticated headers: {headers}")
            
            # Fetch inbounds
            list_url = build_url(api_base, "panel/api/inbounds/list")
            print(f"Fetching inbounds from {list_url}...")
            async with session.get(list_url, headers=headers, timeout=DEFAULT_TIMEOUT, ssl=ssl_verify) as resp:
                data = await resp.json()
                inbounds = data.get("obj", [])
                print(f"Fetched {len(inbounds)} inbounds.")
                
            for ib in inbounds:
                ib_id = ib.get("id")
                print(f"\nTarget Inbound ID: {ib_id}")
                
                c_data = {
                    "id": client_uuid,
                    "password": client_uuid,
                    "email": client.name,
                    "limitIp": 0,
                    "totalGB": 0,
                    "expiryTime": 0,
                    "enable": True,
                    "subId": sub_id,
                    "tgId": 0,
                    "reset": 0
                }
                
                # Test Method 1
                add_client_url = build_url(api_base, "panel/api/inbounds/addClient")
                payload = {"id": int(ib_id), "settings": json.dumps({"clients": [c_data]})}
                print(f"Sending Method 1 POST to {add_client_url}...")
                async with session.post(add_client_url, json=payload, headers=headers, timeout=DEFAULT_TIMEOUT, ssl=ssl_verify) as r1:
                    print(f"  Method 1 Status: {r1.status}")
                    print(f"  Method 1 Response: {await r1.text()}")
                    
                # Test Method 2
                add_client_path_url = build_url(api_base, f"panel/api/inbounds/{ib_id}/addClient")
                print(f"Sending Method 2 POST to {add_client_path_url}...")
                async with session.post(add_client_path_url, json={"clients": [c_data]}, headers=headers, timeout=DEFAULT_TIMEOUT, ssl=ssl_verify) as r2:
                    print(f"  Method 2 Status: {r2.status}")
                    print(f"  Method 2 Response: {await r2.text()}")
                    
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(test_add())
