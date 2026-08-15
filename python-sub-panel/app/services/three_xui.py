import aiohttp
import json
import re
import uuid
import base64
from typing import Optional, Dict, Any, List
from app.models import Server, Client


def get_base_urls(server: Server) -> List[str]:
    raw = server.api_url.rstrip('/')
    urls = [raw]
    if "://" in raw:
        scheme = raw.split("://")[0]
        host_part = raw.split("://")[1].split("/")[0]
        origin = f"{scheme}://{host_part}"
        if origin not in urls:
            urls.append(origin)
    return urls


def parse_server_host_port(server: Server):
    raw = server.api_url.replace('https://', '').replace('http://', '').rstrip('/')
    domain_part = raw.split('/')[0]
    if ':' in domain_part:
        host, port = domain_part.split(':')[0], domain_part.split(':')[1]
    else:
        host, port = domain_part, "443"

    ext_host = server.external_domain or host
    try:
        ext_port = server.external_port or int(port)
    except (ValueError, TypeError):
        ext_port = 443
    return ext_host, ext_port


async def login_3xui(session: aiohttp.ClientSession, server: Server) -> Optional[str]:
    """Login to 3x-ui panel and return the working api_base URL, or None on failure."""
    u_name = server.username or server.auth_username or "admin"
    u_pass = server.password or server.auth_password or "admin"

    base_urls = get_base_urls(server)

    for api_base in base_urls:
        # Try form-data POST (most common for 3x-ui)
        for payload_type in ["form", "json"]:
            try:
                if payload_type == "form":
                    login_resp = await session.post(
                        f"{api_base}/login",
                        data={"username": u_name, "password": u_pass},
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False,
                        allow_redirects=True
                    )
                else:
                    login_resp = await session.post(
                        f"{api_base}/login",
                        json={"username": u_name, "password": u_pass},
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False,
                        allow_redirects=True
                    )
                login_resp.release()

                # Verify session is valid by hitting the API
                async with session.get(
                    f"{api_base}/panel/api/inbounds/list",
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as verify_resp:
                    if verify_resp.status == 200:
                        try:
                            vdata = await verify_resp.json()
                        except Exception:
                            vdata = {}
                        if vdata.get("success") is True:
                            return api_base
            except Exception as e:
                print(f"3x-ui login attempt ({payload_type}) error for {api_base}: {e}")
                continue

    print(f"3x-ui login failed for server {server.name} ({server.api_url})")
    return None


async def add_3xui_client(server: Server, client: Client, client_uuid: str, sub_id: str) -> Optional[str]:
    ext_host, ext_port = parse_server_host_port(server)

    # Default stream settings
    protocol = "vless"
    net = "tcp"
    security = "none"
    path = ""
    sni = ext_host
    pbk = ""
    fp = "chrome"
    sid = ""

    try:
        async with aiohttp.ClientSession() as session:
            api_base = await login_3xui(session, server)
            if not api_base:
                print(f"3x-ui: Cannot login for server {server.name}")
                return None

            inbound_id = server.inbound_id
            target_inbound = None

            # Step 1: Fetch all inbounds list
            try:
                async with session.get(
                    f"{api_base}/panel/api/inbounds/list",
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as list_resp:
                    if list_resp.status == 200:
                        ldata = await list_resp.json()
                        if ldata.get("success"):
                            inbound_list = ldata.get("obj", [])
                            if inbound_list:
                                if inbound_id:
                                    for inb in inbound_list:
                                        if str(inb.get("id")) == str(inbound_id):
                                            target_inbound = inb
                                            break
                                if not target_inbound:
                                    target_inbound = inbound_list[0]
                                    inbound_id = target_inbound.get("id")
            except Exception as e:
                print(f"3x-ui: Failed to fetch inbounds list: {e}")

            # Step 2: Single get fallback
            if not target_inbound and inbound_id:
                try:
                    async with session.get(
                        f"{api_base}/panel/api/inbounds/get/{inbound_id}",
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as get_resp:
                        if get_resp.status == 200:
                            gdata = await get_resp.json()
                            if gdata.get("success"):
                                target_inbound = gdata.get("obj", {})
                except Exception as e:
                    print(f"3x-ui: Failed to get inbound {inbound_id}: {e}")

            # Parse inbound settings if found
            if target_inbound:
                inbound_id = target_inbound.get("id")
                protocol = target_inbound.get("protocol", "vless").lower()
                ext_port = server.external_port or target_inbound.get("port") or ext_port

                stream_raw = target_inbound.get("streamSettings", "{}")
                try:
                    stream = json.loads(stream_raw) if isinstance(stream_raw, str) else (stream_raw or {})
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
            else:
                print(f"3x-ui: No inbound found for server {server.name}, will still try to add client")

            # Build client data payload
            c_data = {
                "id": client_uuid,
                "email": client.name,
                "limitIp": 0,
                "totalGB": int(client.data_limit_gb * 1024 * 1024 * 1024) if client.data_limit_gb else 0,
                "expiryTime": 0,
                "enable": True,
                "subId": sub_id,
                "tgId": "",
                "reset": 0
            }
            if security == "reality":
                c_data["flow"] = "xtls-rprx-vision"

            # Resolve inbound ID as integer
            ib_id_int = 1
            if inbound_id is not None:
                try:
                    ib_id_int = int(inbound_id)
                except (ValueError, TypeError):
                    pass

            added = False

            # Method 1: POST /panel/api/inbounds/addClient
            for payload in [
                {"id": ib_id_int, "settings": json.dumps({"clients": [c_data]})},
                {"id": ib_id_int, "settings": {"clients": [c_data]}},
            ]:
                if added:
                    break
                try:
                    async with session.post(
                        f"{api_base}/panel/api/inbounds/addClient",
                        json=payload,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as add_resp:
                        resp_text = await add_resp.text()
                        if add_resp.status == 200:
                            try:
                                res = json.loads(resp_text)
                            except Exception:
                                res = {}
                            if res.get("success"):
                                added = True
                                print(f"3x-ui: Client added via addClient for {server.name}")
                                break
                            else:
                                print(f"3x-ui: addClient returned: {resp_text[:200]}")
                except Exception as e:
                    print(f"3x-ui: addClient exception: {e}")

            # Method 2: POST /panel/api/inbounds/{id}/addClient
            if not added:
                for payload in [{"clients": [c_data]}, {"settings": json.dumps({"clients": [c_data]})}]:
                    try:
                        async with session.post(
                            f"{api_base}/panel/api/inbounds/{ib_id_int}/addClient",
                            json=payload,
                            timeout=aiohttp.ClientTimeout(total=5),
                            ssl=False
                        ) as add_resp2:
                            resp_text2 = await add_resp2.text()
                            if add_resp2.status == 200:
                                try:
                                    res2 = json.loads(resp_text2)
                                except Exception:
                                    res2 = {}
                                if res2.get("success"):
                                    added = True
                                    print(f"3x-ui: Client added via /{ib_id_int}/addClient for {server.name}")
                                    break
                                else:
                                    print(f"3x-ui: /{ib_id_int}/addClient returned: {resp_text2[:200]}")
                    except Exception as e:
                        print(f"3x-ui: /{ib_id_int}/addClient exception: {e}")
                    if added:
                        break

            # Method 3: Inbound update fallback
            if not added:
                try:
                    async with session.get(
                        f"{api_base}/panel/api/inbounds/get/{ib_id_int}",
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as get_resp2:
                        if get_resp2.status == 200:
                            gdata2 = await get_resp2.json()
                            if gdata2.get("success"):
                                inb_obj = gdata2.get("obj", {})
                                inb_settings_raw = inb_obj.get("settings", "{}")
                                try:
                                    inb_settings = json.loads(inb_settings_raw) if isinstance(inb_settings_raw, str) else (inb_settings_raw or {})
                                except Exception:
                                    inb_settings = {}

                                existing_clients = inb_settings.get("clients", [])
                                existing_clients = [cl for cl in existing_clients if cl.get("email") != client.name and cl.get("id") != client_uuid]
                                existing_clients.append(c_data)
                                inb_settings["clients"] = existing_clients
                                inb_obj["settings"] = json.dumps(inb_settings)

                                async with session.post(
                                    f"{api_base}/panel/api/inbounds/update/{ib_id_int}",
                                    json=inb_obj,
                                    timeout=aiohttp.ClientTimeout(total=5),
                                    ssl=False
                                ) as update_resp:
                                    if update_resp.status == 200:
                                        ures = await update_resp.json()
                                        if ures.get("success"):
                                            added = True
                                            print(f"3x-ui: Client added via inbound update for {server.name}")
                except Exception as e:
                    print(f"3x-ui: Inbound update fallback exception: {e}")

            if not added:
                print(f"3x-ui: All methods failed to add client {client.name} on {server.name}")
                return None

            # Build access URL
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
                    "tls": security if security != "none" else ""
                }
                access_url = "vmess://" + base64.b64encode(json.dumps(vmess_dic).encode()).decode()
            elif protocol == "trojan":
                access_url = f"trojan://{client_uuid}@{ext_host}:{ext_port}?type={net}&security={security}&sni={sni}&path={path}#{server.name} - {client.name}"
            else:
                access_url = f"vless://{client_uuid}@{ext_host}:{ext_port}?type={net}&security={security}#{server.name} - {client.name}"

            return access_url

    except Exception as e:
        print(f"3x-ui add client error for {server.name}: {e}")
    return None


async def delete_3xui_client(server: Server, client_uuid: str) -> bool:
    try:
        async with aiohttp.ClientSession() as session:
            api_base = await login_3xui(session, server)
            if not api_base:
                return False

            inbound_id = server.inbound_id or 1
            try:
                inbound_id = int(inbound_id)
            except (ValueError, TypeError):
                inbound_id = 1

            deleted = False

            # Method 1: direct delete endpoint
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

            # Method 2: update inbound settings fallback
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
                                    inb_settings = json.loads(inb_settings_raw) if isinstance(inb_settings_raw, str) else (inb_settings_raw or {})
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


async def set_3xui_client_enabled(server: Server, client_uuid: str, enabled: bool) -> bool:
    """Enable or disable a client on 3x-ui panel."""
    try:
        async with aiohttp.ClientSession() as session:
            api_base = await login_3xui(session, server)
            if not api_base:
                return False

            inbound_id = server.inbound_id or 1
            try:
                inbound_id = int(inbound_id)
            except (ValueError, TypeError):
                inbound_id = 1

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
                                inb_settings = json.loads(inb_settings_raw) if isinstance(inb_settings_raw, str) else (inb_settings_raw or {})
                            except Exception:
                                inb_settings = {}

                            clients_list = inb_settings.get("clients", [])
                            for c in clients_list:
                                if c.get("id") == client_uuid:
                                    c["enable"] = enabled
                                    break
                            inb_settings["clients"] = clients_list
                            inb_obj["settings"] = json.dumps(inb_settings)

                            async with session.post(
                                f"{api_base}/panel/api/inbounds/update/{inbound_id}",
                                json=inb_obj,
                                timeout=aiohttp.ClientTimeout(total=5),
                                ssl=False
                            ) as update_resp:
                                if update_resp.status == 200:
                                    ures = await update_resp.json()
                                    return bool(ures.get("success"))
            except Exception as e:
                print(f"3x-ui set_enabled error: {e}")

    except Exception:
        pass
    return False
