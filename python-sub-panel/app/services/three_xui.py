import asyncio
import logging
import json
import base64
import re
from typing import Optional, Dict, Any, List
import aiohttp
from app.models import Server, Client

logger = logging.getLogger(__name__)

# Production-ready API request timeouts (15s total, 5s connect)
DEFAULT_TIMEOUT = aiohttp.ClientTimeout(total=15, connect=5)


def build_url(base_url: str, endpoint: str) -> str:
    """
    Safely join base URL and API endpoint handling custom web root paths 
    (e.g., http://ip:port/custom_path/) without double or missing slashes.
    """
    base = base_url.rstrip("/")
    ep = endpoint.lstrip("/")
    return f"{base}/{ep}"


def get_base_urls(server: Server) -> List[str]:
    """Return sanitized base URL(s) for the server."""
    if not server.api_url:
        return []
    raw = server.api_url.rstrip('/')
    return [raw]


def get_ssl_setting(server: Server) -> bool:
    """
    Determine SSL verification setting.
    Returns True for domain HTTPS URLs, False for raw IP addresses or HTTP URLs.
    """
    if not server.api_url:
        return False
    # If using HTTPS and host is a domain name (not raw IPv4)
    if server.api_url.startswith("https://"):
        host_part = server.api_url.replace("https://", "").split("/")[0].split(":")[0]
        # Check if host_part is not purely numbers and dots (IP)
        if not host_part.replace(".", "").isdigit():
            return True
    return False


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


async def login_3xui(session: aiohttp.ClientSession, server: Server, timeout: Optional[aiohttp.ClientTimeout] = None) -> Optional[str]:
    """Login to 3x-ui panel and return the working api_base URL, or None on failure."""
    u_name = server.username or server.auth_username or "admin"
    u_pass = server.password or server.auth_password or "admin"
    req_timeout = timeout or DEFAULT_TIMEOUT
    ssl_verify = get_ssl_setting(server)

    base_urls = get_base_urls(server)

    for api_base in base_urls:
        origin = api_base
        if "://" in api_base:
            parts = api_base.split("://")
            host_part = parts[1].split("/")[0]
            origin = f"{parts[0]}://{host_part}"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": origin,
            "Referer": f"{api_base}/",
        }

        # Step 0: Fetch root panel URL to initialize session cookie and extract CSRF token
        root_url = build_url(api_base, "")
        csrf_token = ""
        try:
            async with session.get(
                root_url,
                headers={"User-Agent": headers["User-Agent"]},
                timeout=req_timeout,
                ssl=ssl_verify
            ) as root_resp:
                root_html = await root_resp.text()
                csrf_match = re.search(r'name="csrf-token"\s+content="([^"]+)"', root_html)
                if csrf_match:
                    csrf_token = csrf_match.group(1)
        except Exception as e:
            logger.debug(f"3x-ui pre-fetch root failed for {root_url} (ssl={ssl_verify}): {e}")
            # Fallback ssl=False if SSL cert verification fails
            if ssl_verify:
                ssl_verify = False
                try:
                    async with session.get(
                        root_url,
                        headers={"User-Agent": headers["User-Agent"]},
                        timeout=req_timeout,
                        ssl=False
                    ) as root_resp:
                        root_html = await root_resp.text()
                        csrf_match = re.search(r'name="csrf-token"\s+content="([^"]+)"', root_html)
                        if csrf_match:
                            csrf_token = csrf_match.group(1)
                except Exception:
                    pass

        if csrf_token:
            headers["X-CSRF-Token"] = csrf_token
            headers["X-Requested-With"] = "XMLHttpRequest"

        login_url = build_url(api_base, "login")

        try:
            # Try form-urlencoded first (matching standard 3x-ui browser form submission)
            form_headers = dict(headers)
            form_headers["Content-Type"] = "application/x-www-form-urlencoded"

            async with session.post(
                login_url,
                data={"username": u_name, "password": u_pass},
                headers=form_headers,
                timeout=req_timeout,
                ssl=ssl_verify,
                allow_redirects=True
            ) as login_resp:
                login_status = login_resp.status
                login_text = await login_resp.text()

            logger.info(f"3x-ui login (form) for {login_url}: HTTP {login_status} | body: {login_text[:120]}")

            # Check if form login succeeded
            login_success = False
            if login_status == 200:
                try:
                    ldata = json.loads(login_text)
                    if ldata.get("success") is True:
                        login_success = True
                except json.JSONDecodeError:
                    pass

            # If form login did not return success=true (and not 403), try JSON payload fallback
            if not login_success and login_status != 403:
                json_headers = dict(headers)
                json_headers["Content-Type"] = "application/json"
                async with session.post(
                    login_url,
                    json={"username": u_name, "password": u_pass},
                    headers=json_headers,
                    timeout=req_timeout,
                    ssl=ssl_verify,
                    allow_redirects=True
                ) as login_resp2:
                    login_status = login_resp2.status
                    login_text = await login_resp2.text()
                logger.info(f"3x-ui login (json) for {login_url}: HTTP {login_status} | body: {login_text[:120]}")

            if login_status == 403:
                logger.warning(f"3x-ui: HTTP 403 Forbidden! IP is blocked by 3x-ui loginLimiter in memory. Please run 'systemctl restart x-ui' on server {server.name}.")
                continue

            if login_status not in (200, 302):
                logger.warning(f"3x-ui: Login returned HTTP {login_status}, skipping {api_base}")
                continue

            # Verify session is authenticated
            verify_url = build_url(api_base, "panel/api/inbounds/list")
            async with session.get(
                verify_url,
                headers={"User-Agent": headers["User-Agent"]},
                timeout=req_timeout,
                ssl=ssl_verify
            ) as verify_resp:
                verify_text = await verify_resp.text()
                logger.info(f"3x-ui verify inbounds/list: HTTP {verify_resp.status} body={verify_text[:150]}")
                if verify_resp.status == 200:
                    try:
                        vdata = json.loads(verify_text)
                    except json.JSONDecodeError:
                        vdata = {}
                    if vdata.get("success") is True:
                        return api_base

        except asyncio.TimeoutError:
            logger.error(f"3x-ui login timeout ({req_timeout.total}s) for {login_url}")
        except aiohttp.ClientConnectorError as e:
            logger.error(f"3x-ui connection error for {login_url}: {e}")
        except aiohttp.ClientResponseError as e:
            logger.error(f"3x-ui HTTP response error {e.status} for {login_url}")
        except aiohttp.ClientError as e:
            logger.error(f"3x-ui network error logging into {login_url}: {type(e).__name__}: {e}")
        except json.JSONDecodeError as e:
            logger.error(f"3x-ui returned non-JSON response from {login_url}: {e}")
        except Exception as e:
            logger.error(f"3x-ui unexpected login error for {login_url}: {type(e).__name__}: {e}")

    logger.error(f"3x-ui login failed for server {server.name} ({server.api_url})")
    return None


async def add_3xui_client(server: Server, client: Client, client_uuid: str, sub_id: str) -> Optional[str]:
    ext_host, ext_port = parse_server_host_port(server)
    ssl_verify = get_ssl_setting(server)

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
        # Use unsafe CookieJar to allow cookies from all hosts including IP addresses
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            api_base = await login_3xui(session, server)
            if not api_base:
                logger.error(f"3x-ui: Cannot login for server {server.name}")
                return None

            inbound_id = server.inbound_id
            target_inbound = None

            # Step 1: Fetch all inbounds list
            list_url = build_url(api_base, "panel/api/inbounds/list")
            try:
                async with session.get(
                    list_url,
                    timeout=DEFAULT_TIMEOUT,
                    ssl=ssl_verify
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
            except asyncio.TimeoutError:
                logger.error(f"3x-ui timeout fetching inbounds list for {server.name}")
            except aiohttp.ClientError as e:
                logger.error(f"3x-ui network error fetching inbounds list for {server.name}: {e}")
            except json.JSONDecodeError as e:
                logger.error(f"3x-ui invalid JSON fetching inbounds list for {server.name}: {e}")
            except Exception as e:
                logger.error(f"3x-ui unexpected error fetching inbounds list: {e}")

            # Step 2: Single get fallback
            if not target_inbound and inbound_id:
                get_inbound_url = build_url(api_base, f"panel/api/inbounds/get/{inbound_id}")
                try:
                    async with session.get(
                        get_inbound_url,
                        timeout=DEFAULT_TIMEOUT,
                        ssl=ssl_verify
                    ) as get_resp:
                        if get_resp.status == 200:
                            gdata = await get_resp.json()
                            if gdata.get("success"):
                                target_inbound = gdata.get("obj", {})
                except Exception as e:
                    logger.error(f"3x-ui: Failed to get inbound {inbound_id}: {e}")

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
                logger.warning(f"3x-ui: No inbound found for server {server.name}, will still try to add client")

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
            add_client_url = build_url(api_base, "panel/api/inbounds/addClient")
            for payload in [
                {"id": ib_id_int, "settings": json.dumps({"clients": [c_data]})},
                {"id": ib_id_int, "settings": {"clients": [c_data]}},
            ]:
                if added:
                    break
                try:
                    async with session.post(
                        add_client_url,
                        json=payload,
                        timeout=DEFAULT_TIMEOUT,
                        ssl=ssl_verify
                    ) as add_resp:
                        resp_text = await add_resp.text()
                        if add_resp.status == 200:
                            try:
                                res = json.loads(resp_text)
                            except Exception:
                                res = {}
                            if res.get("success"):
                                added = True
                                logger.info(f"3x-ui: Client added via addClient for {server.name}")
                                break
                            else:
                                logger.warning(f"3x-ui: addClient returned: {resp_text[:200]}")
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    logger.error(f"3x-ui: addClient network error: {type(e).__name__}: {e}")
                except Exception as e:
                    logger.error(f"3x-ui: addClient exception: {e}")

            # Method 2: POST /panel/api/inbounds/{id}/addClient
            if not added:
                add_client_path_url = build_url(api_base, f"panel/api/inbounds/{ib_id_int}/addClient")
                for payload in [{"clients": [c_data]}, {"settings": json.dumps({"clients": [c_data]})}]:
                    try:
                        async with session.post(
                            add_client_path_url,
                            json=payload,
                            timeout=DEFAULT_TIMEOUT,
                            ssl=ssl_verify
                        ) as add_resp2:
                            resp_text2 = await add_resp2.text()
                            if add_resp2.status == 200:
                                try:
                                    res2 = json.loads(resp_text2)
                                except Exception:
                                    res2 = {}
                                if res2.get("success"):
                                    added = True
                                    logger.info(f"3x-ui: Client added via /{ib_id_int}/addClient for {server.name}")
                                    break
                                else:
                                    logger.warning(f"3x-ui: /{ib_id_int}/addClient returned: {resp_text2[:200]}")
                    except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                        logger.error(f"3x-ui: /{ib_id_int}/addClient network error: {type(e).__name__}: {e}")
                    except Exception as e:
                        logger.error(f"3x-ui: /{ib_id_int}/addClient exception: {e}")
                    if added:
                        break

            # Method 3: Inbound update fallback
            if not added:
                get_inb_url = build_url(api_base, f"panel/api/inbounds/get/{ib_id_int}")
                update_inb_url = build_url(api_base, f"panel/api/inbounds/update/{ib_id_int}")
                try:
                    async with session.get(
                        get_inb_url,
                        timeout=DEFAULT_TIMEOUT,
                        ssl=ssl_verify
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
                                    update_inb_url,
                                    json=inb_obj,
                                    timeout=DEFAULT_TIMEOUT,
                                    ssl=ssl_verify
                                ) as update_resp:
                                    if update_resp.status == 200:
                                        ures = await update_resp.json()
                                        if ures.get("success"):
                                            added = True
                                            logger.info(f"3x-ui: Client added via inbound update for {server.name}")
                except Exception as e:
                    logger.error(f"3x-ui: Inbound update fallback exception: {e}")

            if not added:
                logger.error(f"3x-ui: All methods failed to add client {client.name} on {server.name}")
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
        logger.error(f"3x-ui add client error for {server.name}: {e}")
    return None


async def delete_3xui_client(server: Server, client_uuid: str) -> bool:
    ssl_verify = get_ssl_setting(server)
    try:
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
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
            del_url = build_url(api_base, f"panel/api/inbounds/{inbound_id}/delClient/{client_uuid}")
            try:
                async with session.post(
                    del_url,
                    timeout=DEFAULT_TIMEOUT,
                    ssl=ssl_verify
                ) as del_resp:
                    if del_resp.status == 200:
                        res = await del_resp.json()
                        if res.get("success"):
                            deleted = True
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                logger.debug(f"3x-ui direct delClient network error for {client_uuid}: {e}")
            except Exception as e:
                logger.debug(f"3x-ui direct delClient failed for {client_uuid}: {e}")

            # Method 2: update inbound settings fallback
            if not deleted:
                get_inb_url = build_url(api_base, f"panel/api/inbounds/get/{inbound_id}")
                update_inb_url = build_url(api_base, f"panel/api/inbounds/update/{inbound_id}")
                try:
                    async with session.get(
                        get_inb_url,
                        timeout=DEFAULT_TIMEOUT,
                        ssl=ssl_verify
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
                                    update_inb_url,
                                    json=inb_obj,
                                    timeout=DEFAULT_TIMEOUT,
                                    ssl=ssl_verify
                                ) as update_resp:
                                    if update_resp.status == 200:
                                        ures = await update_resp.json()
                                        if ures.get("success"):
                                            deleted = True
                except Exception as e:
                    logger.error(f"3x-ui delete fallback error: {e}")

            return deleted
    except Exception as e:
        logger.error(f"3x-ui delete client root error: {e}")
        return False


async def set_3xui_client_enabled(server: Server, client_uuid: str, enabled: bool) -> bool:
    """Enable or disable a client on 3x-ui panel."""
    ssl_verify = get_ssl_setting(server)
    try:
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            api_base = await login_3xui(session, server)
            if not api_base:
                return False

            inbound_id = server.inbound_id or 1
            try:
                inbound_id = int(inbound_id)
            except (ValueError, TypeError):
                inbound_id = 1

            get_inb_url = build_url(api_base, f"panel/api/inbounds/get/{inbound_id}")
            update_inb_url = build_url(api_base, f"panel/api/inbounds/update/{inbound_id}")

            try:
                async with session.get(
                    get_inb_url,
                    timeout=DEFAULT_TIMEOUT,
                    ssl=ssl_verify
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
                                update_inb_url,
                                json=inb_obj,
                                timeout=DEFAULT_TIMEOUT,
                                ssl=ssl_verify
                            ) as update_resp:
                                if update_resp.status == 200:
                                    ures = await update_resp.json()
                                    return bool(ures.get("success"))
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                logger.error(f"3x-ui set_enabled network error for {client_uuid}: {e}")
            except Exception as e:
                logger.error(f"3x-ui set_enabled error: {e}")

    except Exception as e:
        logger.error(f"3x-ui set_enabled root error: {e}")
    return False

