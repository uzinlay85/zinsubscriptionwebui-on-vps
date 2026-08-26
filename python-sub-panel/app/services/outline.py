import json
from typing import Optional, Dict, Any, List

import aiohttp
from app.models import Client, ClientKey, Server

import logging
logger = logging.getLogger(__name__)

def get_outline_base_url(server: Server) -> str:
    raw = (server.api_url or "").strip().strip('"').strip("'")
    if raw.startswith("{") and "apiUrl" in raw:
        try:
            parsed = json.loads(raw)
            raw = parsed.get("apiUrl", raw).strip().strip('"').strip("'")
        except Exception:
            pass
    url = raw.rstrip("/")
    if url.endswith("/access-keys"):
        url = url[:-len("/access-keys")].rstrip("/")
    return url

def rewrite_outline_access_url(raw_url: str, server: Server) -> str:
    if not raw_url:
        return ""
    url = raw_url
    if server.external_domain or server.external_port:
        import re
        # Standard Outline URL: ss://[base64_credentials]@[host]:[port]/?outline=1#...
        # or ss://[base64_credentials]@[host]:[port]#...
        pattern = r'^(ss://[^@]+@)([^:/?#]+)(:\d+)?(.*)$'
        match = re.match(pattern, url)
        if match:
            prefix, host, port_part, suffix = match.groups()
            new_host = server.external_domain or host
            new_port = f":{server.external_port}" if server.external_port else (port_part or "")
            url = f"{prefix}{new_host}{new_port}{suffix}"
    return url

async def create_key(server: Server, client_name: str) -> Optional[Dict[str, Any]]:
    base_url = get_outline_base_url(server)
    if not base_url:
        logger.error(f"Outline create_key: Server {server.name} has empty api_url.")
        return None

    url = f"{base_url}/access-keys"
    try:
        async with aiohttp.ClientSession() as session:
            data = None
            key_id = None
            
            # Method 1: POST with json body {"name": client_name}
            try:
                async with session.post(
                    url,
                    json={"name": client_name},
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as resp:
                    if resp.status in [200, 201]:
                        data = await resp.json()
            except Exception as e:
                logger.debug(f"Outline POST with name failed on {server.name}: {e}")
                data = None

            # Method 2: Fallback POST with empty body (standard Shadowbox API), then rename
            if not data:
                try:
                    async with session.post(
                        url,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as resp2:
                        if resp2.status in [200, 201]:
                            data = await resp2.json()
                            key_id = data.get("id", "")
                            # Set key name via PUT
                            if key_id:
                                try:
                                    async with session.put(
                                        f"{url}/{key_id}/name",
                                        json={"name": client_name},
                                        timeout=aiohttp.ClientTimeout(total=5),
                                        ssl=False
                                    ) as put_resp:
                                        if put_resp.status not in [200, 204]:
                                            # Fallback to form data
                                            await session.put(
                                                f"{url}/{key_id}/name",
                                                data={"name": client_name},
                                                timeout=aiohttp.ClientTimeout(total=5),
                                                ssl=False
                                            )
                                except Exception:
                                    pass
                except Exception as e:
                    logger.debug(f"Outline fallback POST failed on {server.name}: {e}")
                    data = None

            if data:
                key_id = str(data.get("id", ""))
                raw_url = data.get("accessUrl", "")
                if raw_url:
                    if "#" in raw_url:
                        raw_url = raw_url.split("#")[0]
                    raw_url = rewrite_outline_access_url(raw_url, server)
                    access_url = f"{raw_url}#{server.name} - {client_name}"
                else:
                    access_url = ""
                return {
                    "key_id": key_id,
                    "access_url": access_url,
                    "uuid": None
                }
            else:
                logger.error(f"Outline create_key failed on {server.name} ({url}) using all methods.")
    except Exception as e:
        logger.error(f"Outline create_key exception on {server.name}: {e}")
    return None

async def delete_key(server: Server, key_id: str) -> bool:
    base_url = get_outline_base_url(server)
    if not base_url:
        return False
    try:
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                f"{base_url}/access-keys/{key_id}",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                return resp.status in [200, 204]
    except Exception as e:
        logger.error(f"Outline delete_key exception on {server.name} (key {key_id}): {e}")
        return False

async def fetch_metrics(server: Server) -> Dict[str, int]:
    base_url = get_outline_base_url(server)
    if not base_url:
        return {}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{base_url}/metrics/transfer",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("bytesTransferredByUserId", {})
    except Exception:
        pass
    return {}

async def set_data_limit(server: Server, key_id: str, limit_bytes: int) -> bool:
    base_url = get_outline_base_url(server)
    if not base_url:
        return False
    try:
        async with aiohttp.ClientSession() as session:
            async with session.put(
                f"{base_url}/access-keys/{key_id}/data-limit",
                json={"limit": {"bytes": limit_bytes}},
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                return resp.status in [200, 204]
    except Exception:
        return False

async def remove_data_limit(server: Server, key_id: str) -> bool:
    base_url = get_outline_base_url(server)
    if not base_url:
        return False
    try:
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                f"{base_url}/access-keys/{key_id}/data-limit",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                return resp.status in [200, 204]
    except Exception:
        return False

async def get_all_keys(server: Server) -> List[Dict[str, Any]]:
    base_url = get_outline_base_url(server)
    if not base_url:
        return []
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{base_url}/access-keys",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("accessKeys", [])
    except Exception:
        pass
    return []
