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

    def normalize_key(data: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(data, dict):
            return None
        key_id = str(data.get("id") or "")
        raw_url = data.get("accessUrl") or data.get("access_url") or ""
        if not key_id or not raw_url:
            return None
        raw_url = raw_url.split("#", 1)[0]
        raw_url = rewrite_outline_access_url(raw_url, server)
        return {
            "key_id": key_id,
            "access_url": f"{raw_url}#{server.name} - {client_name}",
            "uuid": None,
        }

    async def find_key_by_name(session: aiohttp.ClientSession) -> Optional[Dict[str, Any]]:
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False,
            ) as list_resp:
                if list_resp.status != 200:
                    logger.warning(
                        "Outline key lookup after create returned HTTP %s on %s",
                        list_resp.status,
                        server.name,
                    )
                    return None
                listing = await list_resp.json(content_type=None)
                keys = listing.get("accessKeys", []) if isinstance(listing, dict) else []
                for item in keys:
                    if isinstance(item, dict) and item.get("name") == client_name:
                        return normalize_key(item)
        except Exception as e:
            logger.warning("Outline key lookup after create failed on %s: %s", server.name, e)
        return None

    try:
        async with aiohttp.ClientSession() as session:
            # Standard Outline API: POST /access-keys with a JSON name.
            try:
                async with session.post(
                    url,
                    json={"name": client_name},
                    timeout=aiohttp.ClientTimeout(total=8),
                    ssl=False,
                ) as resp:
                    if resp.status in [200, 201]:
                        try:
                            data = await resp.json(content_type=None)
                        except Exception:
                            data = None
                        normalized = normalize_key(data)
                        if normalized:
                            return normalized
                        # Some reverse proxies return 2xx with an empty/non-JSON
                        # body even though Outline created the key.
                        normalized = await find_key_by_name(session)
                        if normalized:
                            return normalized
                    else:
                        body = (await resp.text())[:180]
                        logger.warning(
                            "Outline create returned HTTP %s on %s: %s",
                            resp.status,
                            server.name,
                            body,
                        )
            except Exception as e:
                logger.warning("Outline named create failed on %s: %s", server.name, e)

            # Compatibility fallback for standard Shadowbox implementations that
            # require an empty POST followed by a name update.
            try:
                async with session.post(
                    url,
                    timeout=aiohttp.ClientTimeout(total=8),
                    ssl=False,
                ) as resp2:
                    if resp2.status in [200, 201]:
                        try:
                            data = await resp2.json(content_type=None)
                        except Exception:
                            data = None
                        normalized = normalize_key(data)
                        if normalized:
                            return normalized
                        if isinstance(data, dict) and data.get("id"):
                            key_id = str(data["id"])
                            try:
                                async with session.put(
                                    f"{url}/{key_id}/name",
                                    json={"name": client_name},
                                    timeout=aiohttp.ClientTimeout(total=5),
                                    ssl=False,
                                ) as put_resp:
                                    if put_resp.status not in [200, 204]:
                                        logger.warning(
                                            "Outline key rename returned HTTP %s on %s",
                                            put_resp.status,
                                            server.name,
                                        )
                            except Exception as e:
                                logger.warning("Outline key rename failed on %s: %s", server.name, e)
                            return await find_key_by_name(session)
                    else:
                        body = (await resp2.text())[:180]
                        logger.warning(
                            "Outline fallback create returned HTTP %s on %s: %s",
                            resp2.status,
                            server.name,
                            body,
                        )
            except Exception as e:
                logger.warning("Outline fallback create failed on %s: %s", server.name, e)
    except Exception as e:
        logger.error(f"Outline create_key exception on {server.name}: {e}")

    logger.error(f"Outline create_key failed on {server.name}; no usable key response was found.")
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
