import aiohttp
import json
from typing import Optional, Dict, Any, List
from app.models import Client, ClientKey, Server

import logging
logger = logging.getLogger(__name__)

async def create_key(server: Server, client_name: str) -> Optional[Dict[str, Any]]:
    url = f"{server.api_url.rstrip('/')}/access-keys"
    try:
        async with aiohttp.ClientSession() as session:
            # Method 1: POST with json body {"name": client_name}
            data = None
            key_id = None
            raw_url = ""
            
            try:
                async with session.post(
                    url,
                    json={"name": client_name},
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False
                ) as resp:
                    if resp.status in [200, 201]:
                        data = await resp.json()
            except Exception:
                data = None

            # Method 2: Fallback POST with empty body (standard Shadowbox API)
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
                                    await session.put(
                                        f"{url}/{key_id}/name",
                                        data={"name": client_name},
                                        timeout=aiohttp.ClientTimeout(total=5),
                                        ssl=False
                                    )
                                except Exception:
                                    pass
                except Exception:
                    data = None

            if data:
                key_id = data.get("id", "")
                raw_url = data.get("accessUrl", "")
                if raw_url:
                    if "#" in raw_url:
                        raw_url = raw_url.split("#")[0]
                    access_url = f"{raw_url}#{server.name} - {client_name}"
                else:
                    access_url = ""
                return {
                    "key_id": str(key_id),
                    "access_url": access_url,
                    "uuid": None
                }
            else:
                logger.error(f"Outline create_key failed on {server.name} ({url}) using all methods.")
    except Exception as e:
        logger.error(f"Outline create_key exception on {server.name}: {e}")
    return None

async def delete_key(server: Server, key_id: str) -> bool:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                f"{server.api_url}/access-keys/{key_id}",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                return resp.status == 204
    except Exception:
        return False

async def fetch_metrics(server: Server) -> Dict[str, int]:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{server.api_url}/metrics/transfer",
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
    try:
        async with aiohttp.ClientSession() as session:
            async with session.put(
                f"{server.api_url}/access-keys/{key_id}/data-limit",
                json={"limit": {"bytes": limit_bytes}},
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                return resp.status == 204
    except Exception:
        return False

async def remove_data_limit(server: Server, key_id: str) -> bool:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                f"{server.api_url}/access-keys/{key_id}/data-limit",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                return resp.status == 204
    except Exception:
        return False

async def get_all_keys(server: Server) -> List[Dict[str, Any]]:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{server.api_url}/access-keys",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("accessKeys", [])
    except Exception:
        pass
    return []
