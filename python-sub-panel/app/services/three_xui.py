import aiohttp
import json
import re
import uuid
import base64
from typing import Optional, Dict, Any, List
from app.models import Server, Client

async def login_3xui(session: aiohttp.ClientSession, server: Server) -> bool:
    api_base = server.api_url.rstrip('/')
    try:
        async with session.get(f"{api_base}/login", timeout=aiohttp.ClientTimeout(total=5), ssl=False) as resp:
            html = await resp.text() if resp.status == 200 else ""
            
        csrf_token = ""
        csrf_match = re.search(r'csrfToken.*?"([^"]+)"', html) or re.search(r'name=["\']csrf_token["\']\s+value=["\']([^"\']+)["\']', html)
        if csrf_match:
            csrf_token = csrf_match.group(1)
            
        post_data = {"username": server.username, "password": server.password}
        if csrf_token:
            post_data["csrf_token"] = csrf_token
            
        async with session.post(
            f"{api_base}/login",
            data=post_data,
            timeout=aiohttp.ClientTimeout(total=5),
            ssl=False,
            allow_redirects=True
        ) as login_resp:
            if login_resp.status == 200:
                res_text = await login_resp.text()
                if "success" in res_text or "inbounds" in res_text or login_resp.url.path != "/login":
                    return True
                    
        async with session.post(
            f"{api_base}/login",
            json={"username": server.username, "password": server.password},
            timeout=aiohttp.ClientTimeout(total=5),
            ssl=False
        ) as login_resp2:
            if login_resp2.status == 200:
                return True
    except Exception:
        pass
    return False

def parse_server_host_port(server: Server):
    raw = server.api_url.replace('https://', '').replace('http://', '').rstrip('/')
    domain_part = raw.split('/')[0]
    if ':' in domain_part:
        host, port = domain_part.split(':')[0], domain_part.split(':')[1]
    else:
        host, port = domain_part, "443"
    
    ext_host = server.external_domain or host
    ext_port = server.external_port or int(port)
    return ext_host, ext_port

async def add_3xui_client(server: Server, client: Client, client_uuid: str, sub_id: str) -> Optional[str]:
    api_base = server.api_url.rstrip('/')
    ext_host, ext_port = parse_server_host_port(server)
    
    try:
        async with aiohttp.ClientSession() as session:
            logged_in = await login_3xui(session, server)
            if not logged_in:
                return None
                
            inbound_id = server.inbound_id or 1
            
            protocol = "vless"
            net = "tcp"
            security = "none"
            path = ""
            sni = ext_host
            pbk = ""
            fp = "chrome"
            sid = ""
            
            async with session.get(
                f"{api_base}/panel/api/inbounds/get/{inbound_id}",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as get_resp:
                if get_resp.status == 200:
                    data = await get_resp.json()
                    if data.get("success"):
                        obj = data.get("obj", {})
                        protocol = obj.get("protocol", "vless").lower()
                        
                        stream_raw = obj.get("streamSettings", "{}")
                        try:
                            stream = json.loads(stream_raw) if isinstance(stream_raw, str) else stream_raw
                        except Exception:
                            stream = {}
                            
                        net = stream.get("network", "tcp")
                        security = stream.get("security", "none")
                        
                        if net == "ws":
                            path = stream.get("wsSettings", {}).get("path", "/")
                        elif net == "grpc":
                            path = stream.get("grpcSettings", {}).get("serviceName", "")
                            
                        if security == "tls":
                            sni = stream.get("tlsSettings", {}).get("serverName") or ext_host
                        elif security == "reality":
                            real = stream.get("realitySettings", {})
                            pbk = real.get("publicKey", "")
                            fp = real.get("fingerprint", "chrome")
                            snis = real.get("serverNames", [])
                            sni = snis[0] if snis else ext_host
                            sids = real.get("shortIds", [])
                            sid = sids[0] if sids else ""

            c_data = {
                "id": client_uuid,
                "email": client.name,
                "limitIp": 0,
                "totalGB": client.data_limit_gb * 1024 * 1024 * 1024 if client.data_limit_gb else 0,
                "expiryTime": 0,
                "enable": True,
                "subId": sub_id,
                "tgId": "",
                "reset": 0
            }
            if security == "reality":
                c_data["flow"] = "xtls-rprx-vision"

            added = False
            
            # Method 1: POST /panel/api/inbounds/addClient with id and settings JSON string
            try:
                async with session.post(
                    f"{api_base}/panel/api/inbounds/addClient",
                    json={"id": int(inbound_id), "settings": json.dumps({"clients": [c_data]})},
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as add_resp1:
                    if add_resp1.status == 200:
                        res1 = await add_resp1.json()
                        if res1.get("success"):
                            added = True
            except Exception:
                pass

            # Method 2: POST /panel/api/inbounds/{inbound_id}/addClient
            if not added:
                try:
                    async with session.post(
                        f"{api_base}/panel/api/inbounds/{inbound_id}/addClient",
                        json={"clients": [c_data]},
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as add_resp2:
                        if add_resp2.status == 200:
                            res2 = await add_resp2.json()
                            if res2.get("success"):
                                added = True
                except Exception:
                    pass

            # Method 3: Inbound Update Fallback (Reads inbound, appends client to settings, updates inbound)
            if not added:
                try:
                    async with session.get(
                        f"{api_base}/panel/api/inbounds/get/{inbound_id}",
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as get_resp2:
                        if get_resp2.status == 200:
                            gdata = await get_resp2.json()
                            if gdata.get("success"):
                                inb_obj = gdata.get("obj", {})
                                inb_settings_raw = inb_obj.get("settings", "{}")
                                try:
                                    inb_settings = json.loads(inb_settings_raw) if isinstance(inb_settings_raw, str) else inb_settings_raw
                                except Exception:
                                    inb_settings = {}
                                    
                                existing_clients = inb_settings.get("clients", [])
                                existing_clients = [cl for cl in existing_clients if cl.get("email") != client.name and cl.get("id") != client_uuid]
                                existing_clients.append(c_data)
                                inb_settings["clients"] = existing_clients
                                inb_obj["settings"] = json.dumps(inb_settings)
                                
                                async with session.post(
                                    f"{api_base}/panel/api/inbounds/update/{inbound_id}",
                                    json=inb_obj,
                                    timeout=aiohttp.ClientTimeout(total=5),
                                    ssl=False
                                ) as update_resp:
                                    if update_resp.status == 200:
                                        ures = await update_resp.json()
                                        if ures.get("success"):
                                            added = True
                except Exception:
                    pass

            if protocol == "vless":
                if security == "reality":
                    access_url = f"vless://{client_uuid}@{ext_host}:{ext_port}?type={net}&security=reality&pbk={pbk}&fp={fp}&sni={sni}&sid={sid}&flow=xtls-rprx-vision#{server.name} - {client.name}"
                elif security == "tls":
                    access_url = f"vless://{client_uuid}@{ext_host}:{ext_port}?type={net}&security=tls&sni={sni}&path={path}#{server.name} - {client.name}"
                else:
                    access_url = f"vless://{client_uuid}@{ext_host}:{ext_port}?type={net}&security=none&path={path}#{server.name} - {client.name}"
            elif protocol == "vmess":
                vmess_dic = {
                    "v": "2",
                    "ps": f"{server.name} - {client.name}",
                    "add": ext_host,
                    "port": str(ext_port),
                    "id": client_uuid,
                    "aid": "0",
                    "scy": "auto",
                    "net": net,
                    "type": "none",
                    "host": sni,
                    "path": path,
                    "tls": security
                }
                access_url = "vmess://" + base64.b64encode(json.dumps(vmess_dic).encode()).decode()
            elif protocol == "trojan":
                access_url = f"trojan://{client_uuid}@{ext_host}:{ext_port}?type={net}&security={security}&sni={sni}&path={path}#{server.name} - {client.name}"
            else:
                access_url = f"vless://{client_uuid}@{ext_host}:{ext_port}?type={net}&security={security}#{server.name} - {client.name}"
                
            return access_url
    except Exception as e:
        print(f"3x-ui add client error: {e}")
    return None

async def delete_3xui_client(server: Server, client_uuid: str) -> bool:
    api_base = server.api_url.rstrip('/')
    try:
        async with aiohttp.ClientSession() as session:
            logged_in = await login_3xui(session, server)
            if not logged_in:
                return False
                
            inbound_id = server.inbound_id or 1
            deleted = False
            try:
                async with session.post(
                    f"{api_base}/panel/api/inbounds/{inbound_id}/delClient/{client_uuid}",
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as del_resp:
                    if del_resp.status == 200:
                        res = await del_resp.json()
                        if res.get("success"):
                            deleted = True
            except Exception:
                pass
                
            if not deleted:
                try:
                    async with session.get(
                        f"{api_base}/panel/api/inbounds/get/{inbound_id}",
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as get_resp:
                        if get_resp.status == 200:
                            gdata = await get_resp.json()
                            if gdata.get("success"):
                                inb_obj = gdata.get("obj", {})
                                inb_settings_raw = inb_obj.get("settings", "{}")
                                try:
                                    inb_settings = json.loads(inb_settings_raw) if isinstance(inb_settings_raw, str) else inb_settings_raw
                                except Exception:
                                    inb_settings = {}
                                    
                                existing_clients = inb_settings.get("clients", [])
                                existing_clients = [cl for cl in existing_clients if cl.get("id") != client_uuid]
                                inb_settings["clients"] = existing_clients
                                inb_obj["settings"] = json.dumps(inb_settings)
                                
                                async with session.post(
                                    f"{api_base}/panel/api/inbounds/update/{inbound_id}",
                                    json=inb_obj,
                                    timeout=aiohttp.ClientTimeout(total=5),
                                    ssl=False
                                ) as update_resp:
                                    if update_resp.status == 200:
                                        ures = await update_resp.json()
                                        if ures.get("success"):
                                            deleted = True
                except Exception:
                    pass
            return deleted
    except Exception:
        return False
