import aiohttp
import base64
import json
import re
from typing import Optional, Dict, Any, List
from app.models import Client, ClientKey, Server

def get_auth_headers(server: Server) -> Dict[str, str]:
    headers = {}
    if server.auth_username and server.auth_password:
        token = base64.b64encode(f"{server.auth_username}:{server.auth_password}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"
    return headers

async def express_create_user(server: Server, username: str, password: str, expiry_days: int = 0) -> Optional[Dict[str, Any]]:
    try:
        url = f"{server.api_url.rstrip('/')}/api/users"
        headers = get_auth_headers(server)
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json={"username": username, "password": password, "expiry_days": expiry_days},
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                if resp.status in [200, 201]:
                    data = await resp.json()
                    return {
                        "user_id": str(data.get("id", "") or username),
                        "username": username,
                        "password": password
                    }
    except Exception:
        pass
    return None

async def express_delete_user(server: Server, user_id: str) -> bool:
    try:
        url = f"{server.api_url.rstrip('/')}/api/users/{user_id}"
        headers = get_auth_headers(server)
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                return resp.status in [200, 204]
    except Exception:
        return False

async def express_update_user(server: Server, user_id: str, username: str, password: str, expiry_days: int) -> bool:
    try:
        url = f"{server.api_url.rstrip('/')}/api/users/{user_id}"
        headers = get_auth_headers(server)
        async with aiohttp.ClientSession() as session:
            async with session.put(
                url,
                json={"username": username, "password": password, "expiry_days": expiry_days},
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                return resp.status in [200, 204]
    except Exception:
        return False

async def express_fetch_users(server: Server) -> List[Dict[str, Any]]:
    try:
        url = f"{server.api_url.rstrip('/')}/api/users"
        headers = get_auth_headers(server)
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception:
        pass
    return []

async def flask_login(server: Server) -> Optional[Dict[str, Any]]:
    try:
        base_url = server.api_url.rstrip("/")
        async with aiohttp.ClientSession() as session:
            # Step 1: GET /login or / to acquire initial CSRF token
            async with session.get(
                f"{base_url}/login",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                if resp.status == 200:
                    html = await resp.text()
                else:
                    async with session.get(
                        base_url,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as resp2:
                        if resp2.status != 200:
                            return None
                        html = await resp2.text()
                
                csrf_match = re.search(r'name=["\']csrf_token["\']\s+value=["\']([^"\']+)["\']', html) or \
                             re.search(r'csrf_token.*?value=["\']([^"\']+)["\']', html) or \
                             re.search(r'value=["\']([a-f0-9]{32})["\']', html)
                if not csrf_match:
                    return None
                csrf_token = csrf_match.group(1)
                
                # Step 2: POST /login with admin_pass and csrf_token (Hy2_WebUI_ManusAi format)
                pass_input = server.password or server.auth_password or ""
                async with session.post(
                    f"{base_url}/login",
                    data={
                        "csrf_token": csrf_token,
                        "admin_pass": pass_input,
                        "password": pass_input
                    },
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as login_resp:
                    if login_resp.status not in [200, 302]:
                        return None
                
                # Step 3: GET / to get post-login CSRF token
                async with session.get(
                    f"{base_url}/",
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as home_resp:
                    if home_resp.status == 200:
                        home_html = await home_resp.text()
                        csrf_match2 = re.search(r'name=["\']csrf_token["\']\s+value=["\']([^"\']+)["\']', home_html) or \
                                     re.search(r'csrf_token.*?value=["\']([^"\']+)["\']', home_html)
                        if csrf_match2:
                            csrf_token = csrf_match2.group(1)
                
                return {"cookie": session.cookie_jar, "csrf_token": csrf_token}
    except Exception:
        pass
    return None

async def flask_add_user(server: Server, username: str, password: str, limit_gb: int = 0, days: int = 0) -> bool:
    auth = await flask_login(server)
    if not auth:
        return False
    
    try:
        base_url = server.api_url.rstrip("/")
        async with aiohttp.ClientSession(cookie_jar=auth["cookie"]) as session:
            async with session.post(
                f"{base_url}/add",
                data={
                    "csrf_token": auth["csrf_token"],
                    "user_name": username,
                    "user_pass": password,
                    "limit_gb": str(limit_gb),
                    "days": str(days)
                },
                timeout=aiohttp.ClientTimeout(total=10),
                ssl=False
            ) as resp:
                return resp.status in [200, 302]
    except Exception:
        return False

async def flask_delete_user(server: Server, user_pass: str) -> bool:
    auth = await flask_login(server)
    if not auth:
        return False
    
    try:
        base_url = server.api_url.rstrip("/")
        async with aiohttp.ClientSession(cookie_jar=auth["cookie"]) as session:
            async with session.post(
                f"{base_url}/delete",
                data={
                    "csrf_token": auth["csrf_token"],
                    "user_pass": user_pass
                },
                timeout=aiohttp.ClientTimeout(total=10),
                ssl=False
            ) as resp:
                return resp.status in [200, 302]
    except Exception:
        return False

async def flask_fetch_users(server: Server) -> List[Dict[str, Any]]:
    auth = await flask_login(server)
    if not auth:
        return []
    
    try:
        async with aiohttp.ClientSession(cookie_jar=auth["cookie"]) as session:
            async with session.get(
                server.api_url,
                timeout=aiohttp.ClientTimeout(total=15),
                ssl=False
            ) as resp:
                if resp.status != 200:
                    return []
                html = await resp.text()
                users = []
                rows = re.findall(r'<tr>.*?</tr>', html, re.DOTALL)
                for row in rows:
                    username_match = re.search(r'<td[^>]*>([\w_-]+)</td>', row)
                    password_match = re.search(r'<td[^>]*>([\w_-]+)</td>', row)
                    if username_match:
                        users.append({
                            "username": username_match.group(1),
                            "password": password_match.group(1) if password_match else "",
                            "tx": 0,
                            "rx": 0
                        })
                return users
    except Exception:
        return []

async def fetch_hysteria2_metrics(server: Server) -> Dict[str, int]:
    try:
        auth = None
        if server.auth_username and server.auth_password:
            token = base64.b64encode(f"{server.auth_username}:{server.auth_password}".encode()).decode()
            auth = {"Authorization": f"Basic {token}"}
        
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{server.api_url}/api/users",
                headers=auth,
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                if resp.status == 200:
                    users = await resp.json()
                    metrics = {}
                    for user in users:
                        username = user.get("username", "")
                        tx = user.get("tx", 0) or 0
                        rx = user.get("rx", 0) or 0
                        metrics[username] = tx + rx
                    return metrics
    except Exception:
        pass
    return {}
