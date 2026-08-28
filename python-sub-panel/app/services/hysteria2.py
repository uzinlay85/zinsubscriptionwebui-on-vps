import aiohttp
import base64
import json
import re
import logging
from typing import Optional, Dict, Any, List
from app.models import Client, ClientKey, Server

logger = logging.getLogger(__name__)

def get_hysteria2_host_port(server: Server) -> tuple[str, int]:
    """
    Extract public host and UDP port for Hysteria2 client access URLs.
    If external_domain / external_port are explicitly set, they take priority.
    Otherwise, extracts host from api_url and defaults the Hysteria 2 UDP port to 10443
    (since web API is on 80/443/5000, while Hysteria2 VPN listens on 10443).
    """
    raw_host_port = (server.api_url or "").replace('https://', '').replace('http://', '').rstrip('/').split('/')[0]
    if ':' in raw_host_port:
        parsed_host, parsed_port_str = raw_host_port.split(':')[0], raw_host_port.split(':')[1]
        try:
            parsed_port = int(parsed_port_str)
        except ValueError:
            parsed_port = 10443
    else:
        parsed_host = raw_host_port
        parsed_port = 10443

    host = (server.external_domain or "").strip() or parsed_host
    if server.external_port:
        port = int(server.external_port)
    else:
        # Standard web ports (443, 80, 5000, 8000) mean api_url pointed to the WebUI;
        # Hysteria2 VPN itself runs on UDP port 10443.
        if parsed_port in (80, 443, 5000, 8000):
            port = 10443
        else:
            port = parsed_port
    return host, port

def build_hysteria2_access_url(server: Server, client_name: str, password: str, flag_emoji: str = "🌐") -> str:
    host, port = get_hysteria2_host_port(server)
    return f"hy2://{password}@{host}:{port}/?security=tls&sni={host}#{flag_emoji} {server.name} - {client_name}"

def get_auth_headers(server: Server) -> Dict[str, str]:
    headers = {}
    username = server.auth_username or server.username or "admin"
    password = server.auth_password or server.password
    if password:
        token = base64.b64encode(f"{username}:{password}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"
    return headers

async def express_create_user(server: Server, username: str, password: str, expiry_days: int = 0) -> Optional[Dict[str, Any]]:
    headers = get_auth_headers(server)
    base_url = (server.api_url or "").rstrip('/')
    if not base_url:
        return None

    endpoints = [f"{base_url}/api/users", f"{base_url}/users"]
    payload = {"username": username, "password": password, "expiry_days": expiry_days}
    
    try:
        async with aiohttp.ClientSession() as session:
            for url in endpoints:
                try:
                    async with session.post(
                        url,
                        json=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as resp:
                        if resp.status in [200, 201]:
                            try:
                                data = await resp.json()
                            except Exception:
                                data = {}
                            return {
                                "user_id": str(data.get("id", "") or username),
                                "username": username,
                                "password": password
                            }
                except Exception:
                    continue
    except Exception:
        pass
    return None

async def express_delete_user(server: Server, user_id: str) -> bool:
    headers = get_auth_headers(server)
    base_url = (server.api_url or "").rstrip('/')
    if not base_url:
        return False

    endpoints = [
        f"{base_url}/api/users/{user_id}",
        f"{base_url}/users/{user_id}"
    ]
    try:
        async with aiohttp.ClientSession() as session:
            for url in endpoints:
                try:
                    async with session.delete(
                        url,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as resp:
                        if resp.status in [200, 204]:
                            return True
                except Exception:
                    continue
    except Exception:
        pass
    return False

async def express_update_user(server: Server, user_id: str, username: str, password: str, expiry_days: int) -> bool:
    headers = get_auth_headers(server)
    base_url = (server.api_url or "").rstrip('/')
    if not base_url:
        return False

    endpoints = [
        f"{base_url}/api/users/{user_id}",
        f"{base_url}/users/{user_id}"
    ]
    payload = {"username": username, "password": password, "expiry_days": expiry_days}
    try:
        async with aiohttp.ClientSession() as session:
            for url in endpoints:
                try:
                    async with session.put(
                        url,
                        json=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as resp:
                        if resp.status in [200, 204]:
                            return True
                except Exception:
                    continue
    except Exception:
        pass
    return False

async def express_fetch_users(server: Server) -> List[Dict[str, Any]]:
    headers = get_auth_headers(server)
    base_url = (server.api_url or "").rstrip('/')
    if not base_url:
        return []

    endpoints = [f"{base_url}/api/users", f"{base_url}/users"]
    try:
        async with aiohttp.ClientSession() as session:
            for url in endpoints:
                try:
                    async with session.get(
                        url,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            if isinstance(data, list):
                                return data
                            if isinstance(data, dict) and "users" in data:
                                return data["users"]
                except Exception:
                    continue
    except Exception:
        pass
    return []

def get_candidate_base_urls(server: Server) -> List[str]:
    raw = (server.api_url or "").rstrip("/")
    if not raw:
        return []
    urls = [raw]
    if "127.0.0.1" in raw or "localhost" in raw:
        urls.append(raw.replace("127.0.0.1", "host.docker.internal").replace("localhost", "host.docker.internal"))
    elif "host.docker.internal" in raw:
        urls.append(raw.replace("host.docker.internal", "127.0.0.1"))
    return urls

async def flask_login_session(session: aiohttp.ClientSession, server: Server) -> Optional[Dict[str, Any]]:
    candidate_urls = get_candidate_base_urls(server)
    for base_url in candidate_urls:
        try:
            # Step 1: GET /login or base_url to inspect page and acquire optional CSRF token
            html = ""
            try:
                async with session.get(
                    f"{base_url}/login",
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False,
                    allow_redirects=True
                ) as resp:
                    if resp.status == 200:
                        html = await resp.text()
            except Exception:
                pass

            if not html:
                try:
                    async with session.get(
                        base_url,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False,
                        allow_redirects=True
                    ) as resp2:
                        if resp2.status == 200:
                            html = await resp2.text()
                except Exception:
                    pass

            csrf_token = ""
            if html:
                csrf_match = re.search(r'name=["\'](?:csrf_token|_csrf_token|csrf)["\']\s+value=["\']([^"\']+)["\']', html) or \
                             re.search(r'csrf_token.*?value=["\']([^"\']+)["\']', html) or \
                             re.search(r'value=["\']([a-f0-9]{32,64})["\']', html)
                if csrf_match:
                    csrf_token = csrf_match.group(1)

            passwords_to_try = []
            if server.auth_password and server.auth_password not in passwords_to_try: passwords_to_try.append(server.auth_password)
            if server.password and server.password not in passwords_to_try: passwords_to_try.append(server.password)
            if "admin123" not in passwords_to_try: passwords_to_try.append("admin123")
            if "admin" not in passwords_to_try: passwords_to_try.append("admin")

            uname = server.auth_username or server.username or "admin"

            for pass_attempt in passwords_to_try:
                login_payloads = [
                    {"csrf_token": csrf_token, "admin_pass": pass_attempt, "password": pass_attempt},
                    {"username": uname, "password": pass_attempt, "csrf_token": csrf_token},
                ]
                for p_data in login_payloads:
                    if not csrf_token:
                        p_data.pop("csrf_token", None)
                    try:
                        async with session.post(
                            f"{base_url}/login",
                            data=p_data,
                            timeout=aiohttp.ClientTimeout(total=5),
                            ssl=False,
                            allow_redirects=True
                        ) as login_resp:
                            if login_resp.status in [200, 302]:
                                res_html = await login_resp.text()
                                is_login_page = ('action="/login"' in res_html or 'name="admin_pass"' in res_html or "name='admin_pass'" in res_html or "Invalid password" in res_html or "Incorrect password" in res_html)
                                if not is_login_page:
                                    fresh_csrf = csrf_token
                                    csrf_match2 = re.search(r'name=["\'](?:csrf_token|_csrf_token|csrf)["\']\s+value=["\']([^"\']+)["\']', res_html) or \
                                                  re.search(r'csrf_token.*?value=["\']([^"\']+)["\']', res_html) or \
                                                  re.search(r'value=["\']([a-f0-9]{32,64})["\']', res_html)
                                    if csrf_match2:
                                        fresh_csrf = csrf_match2.group(1)
                                    return {
                                        "csrf_token": fresh_csrf,
                                        "working_base_url": base_url
                                    }
                    except Exception:
                        continue
        except Exception:
            continue
    return None

async def flask_login(server: Server) -> Optional[Dict[str, Any]]:
    try:
        session = aiohttp.ClientSession()
        res = await flask_login_session(session, server)
        if res:
            res["cookie"] = session.cookie_jar
            res["session"] = session
            return res
        await session.close()
    except Exception:
        pass
    return None

async def flask_add_user(server: Server, username: str, password: str, limit_gb: int = 0, days: int = 0) -> bool:
    try:
        async with aiohttp.ClientSession() as session:
            auth = await flask_login_session(session, server)
            if not auth:
                # Also try adding directly with Basic Auth on API endpoints
                headers = get_auth_headers(server)
                base_url = (server.api_url or "").rstrip("/")
                for endpoint in ["/api/users", "/users", "/api/add_user", "/add_user", "/add"]:
                    try:
                        async with session.post(
                            f"{base_url}{endpoint}",
                            json={"username": username, "password": password, "limit_gb": limit_gb, "days": days},
                            headers=headers,
                            timeout=aiohttp.ClientTimeout(total=5),
                            ssl=False
                        ) as r:
                            if r.status in [200, 201]:
                                return True
                    except Exception:
                        pass
                return False

            base_url = auth.get("working_base_url") or server.api_url.rstrip("/")

            # Acquire fresh CSRF token if present
            fresh_csrf = auth.get("csrf_token", "")
            try:
                async with session.get(
                    base_url,
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False,
                    allow_redirects=True
                ) as get_resp:
                    if get_resp.status == 200:
                        page_html = await get_resp.text()
                        csrf_match = re.search(r'name=["\'](?:csrf_token|_csrf_token|csrf)["\']\s+value=["\']([^"\']+)["\']', page_html) or \
                                     re.search(r'csrf_token.*?value=["\']([^"\']+)["\']', page_html) or \
                                     re.search(r'value=["\']([a-f0-9]{32,64})["\']', page_html)
                        if csrf_match:
                            fresh_csrf = csrf_match.group(1)
            except Exception:
                pass

            headers = {}
            if fresh_csrf:
                headers = {"X-CSRFToken": fresh_csrf, "X-CSRF-Token": fresh_csrf}
            
            payload = {
                "user_name": username,
                "name": username,
                "username": username,
                "user_pass": password,
                "password": password,
                "limit_gb": str(limit_gb),
                "days": str(days)
            }
            if fresh_csrf:
                payload["csrf_token"] = fresh_csrf

            for endpoint in ["/add", "/add_user", "/user/add", "/api/add_user", "/api/users"]:
                # Try Form Urlencoded
                try:
                    async with session.post(
                        f"{base_url}{endpoint}",
                        data=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=8),
                        ssl=False,
                        allow_redirects=True
                    ) as resp:
                        text = await resp.text()
                        if resp.status in [200, 201, 302] and (password in text or username in text or "success" in text.lower() or resp.status in [200, 201]):
                            return True
                except Exception:
                    pass

                # Try JSON
                try:
                    async with session.post(
                        f"{base_url}{endpoint}",
                        json=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=8),
                        ssl=False,
                        allow_redirects=True
                    ) as resp_json:
                        text_j = await resp_json.text()
                        if resp_json.status in [200, 201, 302] and (password in text_j or username in text_j or "success" in text_j.lower()):
                            return True
                except Exception:
                    pass

            logger.error(f"Hysteria2 flask_add_user failed for {username} across all endpoints.")
            return False
    except Exception as e:
        logger.error(f"Hysteria2 flask_add_user exception: {e}")
        return False

async def flask_delete_user(server: Server, user_pass: str, username: Optional[str] = None) -> bool:
    if not user_pass and not username:
        return False
    try:
        async with aiohttp.ClientSession() as session:
            auth = await flask_login_session(session, server)
            base_url = (auth.get("working_base_url") if auth else None) or server.api_url.rstrip("/")
            csrf = auth.get("csrf_token", "") if auth else ""
            
            # Step 1: Inspect HTML page and execute exact form or link from the user's row
            try:
                async with session.get(
                    base_url,
                    timeout=aiohttp.ClientTimeout(total=10),
                    ssl=False
                ) as resp:
                    if resp.status == 200:
                        html = await resp.text()
                        
                        # Extract fresh CSRF token if present
                        csrf_match = re.search(r'name=["\'](?:csrf_token|_csrf_token|csrf)["\']\s+value=["\']([^"\']+)["\']', html) or \
                                     re.search(r'csrf_token.*?value=["\']([^"\']+)["\']', html) or \
                                     re.search(r'value=["\']([a-f0-9]{32,64})["\']', html)
                        if csrf_match:
                            csrf = csrf_match.group(1)

                        rows = re.findall(r'<tr>(.*?)</tr>', html, re.DOTALL)
                        for row in rows:
                            target_match = False
                            if user_pass and user_pass in row:
                                target_match = True
                            elif username and (f"<b>{username}</b>" in row or f">{username}<" in row):
                                target_match = True

                            if target_match:
                                # Find form in row
                                form_match = re.search(r'<form\s+([^>]*?)>(.*?)</form>', row, re.DOTALL | re.IGNORECASE)
                                if form_match:
                                    form_attrs, form_body = form_match.group(1), form_match.group(2)
                                    action_match = re.search(r'action=["\']([^"\']*)["\']', form_attrs, re.IGNORECASE)
                                    action = action_match.group(1) if action_match else "/delete"
                                    method_match = re.search(r'method=["\']([^"\']*)["\']', form_attrs, re.IGNORECASE)
                                    method = (method_match.group(1) if method_match else "POST").upper()
                                    
                                    form_url = action if action.startswith("http") else f"{base_url.rstrip('/')}/{action.lstrip('/')}"
                                    
                                    # Extract all input fields
                                    form_data = {}
                                    input_matches = re.findall(r'<input\s+([^>]*?)>', form_body, re.IGNORECASE)
                                    for inp in input_matches:
                                        n_m = re.search(r'name=["\']([^"\']+)["\']', inp, re.IGNORECASE)
                                        v_m = re.search(r'value=["\']([^"\']*)["\']', inp, re.IGNORECASE)
                                        if n_m:
                                            form_data[n_m.group(1)] = v_m.group(1) if v_m else ""
                                    
                                    if csrf and "csrf_token" not in form_data:
                                        form_data["csrf_token"] = csrf
                                    if user_pass and "user_pass" not in form_data and "password" not in form_data:
                                        form_data["user_pass"] = user_pass
                                        form_data["password"] = user_pass
                                    
                                    headers = {"X-CSRFToken": csrf, "X-CSRF-Token": csrf} if csrf else {}
                                    try:
                                        if method == "GET":
                                            async with session.get(form_url, params=form_data, headers=headers, timeout=aiohttp.ClientTimeout(total=8), ssl=False, allow_redirects=True) as r:
                                                if r.status in [200, 204, 302]:
                                                    return True
                                        else:
                                            async with session.post(form_url, data=form_data, headers=headers, timeout=aiohttp.ClientTimeout(total=8), ssl=False, allow_redirects=True) as r:
                                                if r.status in [200, 204, 302]:
                                                    return True
                                    except Exception:
                                        pass

                                # Find link in row
                                link_matches = re.findall(r'<a\s+[^>]*?href=["\']([^"\']+)["\']', row, re.IGNORECASE)
                                for link in link_matches:
                                    if any(keyword in link.lower() for keyword in ["del", "remove", "delete"]):
                                        link_url = link if link.startswith("http") else f"{base_url.rstrip('/')}/{link.lstrip('/')}"
                                        try:
                                            async with session.get(link_url, timeout=aiohttp.ClientTimeout(total=8), ssl=False, allow_redirects=True) as r:
                                                if r.status in [200, 204, 302]:
                                                    return True
                                        except Exception:
                                            pass
            except Exception as ex:
                logger.debug(f"flask_delete_user page parsing failed: {ex}")

            # Step 2: Fallback direct API / form endpoints
            headers = {"X-CSRFToken": csrf, "X-CSRF-Token": csrf} if csrf else {}
            u_name = username or (user_pass.split("_")[0] if user_pass and "_" in user_pass else user_pass)
            
            payload_variants = [
                {"user_pass": user_pass, "password": user_pass, "username": u_name, "name": u_name, "user_name": u_name, "csrf_token": csrf},
                {"user_pass": user_pass, "csrf_token": csrf},
                {"password": user_pass, "csrf_token": csrf},
                {"username": u_name, "csrf_token": csrf},
                {"name": u_name, "csrf_token": csrf},
            ]
            
            for endpoint in ["/delete", "/delete_user", "/del_user", "/user/delete", "/api/delete_user", "/api/users/delete"]:
                for p_data in payload_variants:
                    try:
                        async with session.post(
                            f"{base_url}{endpoint}",
                            data=p_data,
                            headers=headers,
                            timeout=aiohttp.ClientTimeout(total=5),
                            ssl=False,
                            allow_redirects=True
                        ) as resp:
                            if resp.status in [200, 204, 302]:
                                return True
                    except Exception:
                        continue
            
            # Step 3: Path parameter variants
            for id_val in filter(None, [user_pass, u_name]):
                for endpoint_prefix in ["/delete/", "/delete_user/", "/del_user/", "/user/delete/"]:
                    try:
                        async with session.post(
                            f"{base_url}{endpoint_prefix}{id_val}",
                            data={"csrf_token": csrf},
                            headers=headers,
                            timeout=aiohttp.ClientTimeout(total=5),
                            ssl=False,
                            allow_redirects=True
                        ) as resp:
                            if resp.status in [200, 204, 302]:
                                return True
                    except Exception:
                        pass
                    try:
                        async with session.get(
                            f"{base_url}{endpoint_prefix}{id_val}",
                            headers=headers,
                            timeout=aiohttp.ClientTimeout(total=5),
                            ssl=False,
                            allow_redirects=True
                        ) as resp:
                            if resp.status in [200, 204, 302]:
                                return True
                    except Exception:
                        pass
    except Exception as e:
        logger.error(f"Hysteria2 flask_delete_user exception for {user_pass}/{username}: {e}")
    return False

async def delete_all_remote_users(server: Server) -> int:
    """
    Purge ALL remote users from the Hysteria2 server (both Express API and Flask WebUI).
    Returns count of successfully deleted remote users.
    """
    deleted_count = 0
    # 1. Try Express fetch & delete
    try:
        express_users = await express_fetch_users(server)
        for u in express_users:
            uid = str(u.get("id", "") or u.get("username", "") or u.get("password", ""))
            uname = str(u.get("username", ""))
            if uid:
                if await express_delete_user(server, uid):
                    deleted_count += 1
                elif uname and await express_delete_user(server, uname):
                    deleted_count += 1
                elif u.get("password"):
                    await flask_delete_user(server, str(u.get("password")), uname)
    except Exception as e:
        logger.debug(f"express delete_all_remote_users error: {e}")

    # 2. Try Flask WebUI fetch & delete
    try:
        flask_users = await flask_fetch_users(server)
        for fu in flask_users:
            pwd = fu.get("password", "")
            uname = fu.get("username", "")
            if pwd or uname:
                if await flask_delete_user(server, pwd, uname):
                    deleted_count += 1
                if uname:
                    await express_delete_user(server, uname)
    except Exception as e:
        logger.debug(f"flask delete_all_remote_users error: {e}")

    return deleted_count

def parse_bytes_from_str(val_str: str, unit_str: str) -> int:
    try:
        val = float(val_str)
        unit = unit_str.upper().strip()
        if "TB" in unit:
            return int(val * 1024 * 1024 * 1024 * 1024)
        elif "GB" in unit:
            return int(val * 1024 * 1024 * 1024)
        elif "MB" in unit:
            return int(val * 1024 * 1024)
        elif "KB" in unit:
            return int(val * 1024)
        else:
            return int(val)
    except Exception:
        return 0

async def flask_fetch_users(server: Server) -> List[Dict[str, Any]]:
    try:
        async with aiohttp.ClientSession() as session:
            auth = await flask_login_session(session, server)
            if not auth:
                return []
            
            base_url = auth.get("working_base_url") or server.api_url.rstrip("/")
            async with session.get(
                base_url,
                timeout=aiohttp.ClientTimeout(total=15),
                ssl=False
            ) as resp:
                if resp.status != 200:
                    return []
                html = await resp.text()
                users = []
                rows = re.findall(r'<tr>.*?</tr>', html, re.DOTALL)
                for row in rows:
                    pass_match = re.search(r'<code>([\w_-]+)</code>', row) or re.search(r'hy2://([\w_-]+)@', row)
                    if not pass_match:
                        continue
                    password = pass_match.group(1).strip()
                    
                    name_match = re.search(r'<b>(.*?)</b>', row)
                    username = name_match.group(1).strip() if name_match else password.split("_")[0]
                    
                    total_bytes = 0
                    tot_match = re.search(r'Total:\s*([\d\.]+)\s*([KMGT]?B)', row, re.IGNORECASE)
                    if tot_match:
                        total_bytes = parse_bytes_from_str(tot_match.group(1), tot_match.group(2))
                    else:
                        tx_match = re.search(r'⬇️\s*([\d\.]+)\s*([KMGT]?B)', row, re.IGNORECASE)
                        rx_match = re.search(r'⬆️\s*([\d\.]+)\s*([KMGT]?B)', row, re.IGNORECASE)
                        tx_b = parse_bytes_from_str(tx_match.group(1), tx_match.group(2)) if tx_match else 0
                        rx_b = parse_bytes_from_str(rx_match.group(1), rx_match.group(2)) if rx_match else 0
                        total_bytes = tx_b + rx_b
                        
                    # Strict Online status check (MUST NOT match 'Offline')
                    is_online = ("status-online" in row or "🟢 Online" in row) and ("status-offline" not in row and "⚪ Offline" not in row)
                    ls_match = re.search(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})', row)
                    last_seen = ls_match.group(1) if ls_match else None
                    
                    users.append({
                        "username": username,
                        "password": password,
                        "bytes": total_bytes,
                        "is_online": is_online,
                        "last_seen": last_seen
                    })
                return users
    except Exception:
        return []

async def fetch_hysteria2_metrics(server: Server) -> Dict[str, Any]:
    try:
        auth = get_auth_headers(server)
        base_url = server.api_url.rstrip("/")
        
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{base_url}/api/users",
                headers=auth,
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                if resp.status == 200:
                    users = await resp.json()
                    metrics = {}
                    for user in users:
                        key = user.get("password") or user.get("username", "")
                        tx = user.get("tx", 0) or 0
                        rx = user.get("rx", 0) or 0
                        metrics[key] = {
                            "bytes": tx + rx,
                            "is_online": user.get("online", False),
                            "last_seen": user.get("last_seen")
                        }
                    if metrics:
                        return metrics
    except Exception:
        pass
        
    flask_users = await flask_fetch_users(server)
    metrics = {}
    for fu in flask_users:
        metric_data = {
            "bytes": fu["bytes"],
            "is_online": fu["is_online"],
            "last_seen": fu["last_seen"]
        }
        metrics[fu["password"]] = metric_data
        metrics[fu["username"]] = metric_data
    return metrics
