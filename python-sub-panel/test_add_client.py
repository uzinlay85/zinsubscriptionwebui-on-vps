import asyncio
import logging
import sys

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
            api_base, headers = await login_3xui(session, server)
            if not api_base:
                print("Login failed.")
                return
                
            # Fetch inbounds
            list_url = build_url(api_base, "panel/api/inbounds/list")
            async with session.get(list_url, headers=headers, timeout=DEFAULT_TIMEOUT, ssl=ssl_verify) as resp:
                data = await resp.json()
                inbounds = data.get("obj", [])
                
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
                    
                # Test Method 3 (Inbound update fallback)
                get_inb_url = build_url(api_base, f"panel/api/inbounds/get/{ib_id}")
                update_inb_url = build_url(api_base, f"panel/api/inbounds/update/{ib_id}")
                print(f"Fetching inbound details from {get_inb_url} (Method 3 prep)...")
                async with session.get(get_inb_url, headers=headers, timeout=DEFAULT_TIMEOUT, ssl=ssl_verify) as get_r:
                    print(f"  Get Inbound Status: {get_r.status}")
                    gdata = await get_r.json()
                    
                if gdata.get("success"):
                    inb_obj = gdata.get("obj", {})
                    inb_settings_raw = inb_obj.get("settings", "{}")
                    try:
                        inb_settings = json.loads(inb_settings_raw) if isinstance(inb_settings_raw, str) else (inb_settings_raw or {})
                    except Exception:
                        inb_settings = {}
                        
                    existing_clients = inb_settings.get("clients", [])
                    # Append client
                    existing_clients = [cl for cl in existing_clients if cl.get("email") != client.name and cl.get("id") != client_uuid]
                    existing_clients.append(c_data)
                    inb_settings["clients"] = existing_clients
                    inb_obj["settings"] = json.dumps(inb_settings)
                    
                    print(f"Sending Method 3 POST to {update_inb_url}...")
                    async with session.post(update_inb_url, json=inb_obj, headers=headers, timeout=DEFAULT_TIMEOUT, ssl=ssl_verify) as update_r:
                        print(f"  Method 3 Status: {update_r.status}")
                        print(f"  Method 3 Response: {await update_r.text()}")
                    
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(test_add())
