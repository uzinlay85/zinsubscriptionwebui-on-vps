import asyncio
import aiohttp
import socket
import logging
from typing import Optional, Tuple, Dict
from app.models import Server

logger = logging.getLogger(__name__)

# In-memory cache for IP/Domain -> (country_code, country_name, flag_emoji)
_GEO_CACHE: Dict[str, Tuple[str, str, str]] = {}

def get_flag_emoji(country_code: Optional[str]) -> str:
    """Convert 2-letter ISO country code into Unicode Flag Emoji."""
    if not country_code or len(country_code.strip()) != 2:
        return "🌐"
    code = country_code.strip().upper()
    if code == "UK":
        code = "GB"
    try:
        return "".join(chr(127397 + ord(c)) for c in code)
    except Exception:
        return "🌐"

def is_private_or_local_host(host: str) -> bool:
    """Check if host is local, internal Docker gateway, or private IP."""
    h = host.lower().strip()
    if not h or h in ["localhost", "127.0.0.1", "::1", "host.docker.internal"]:
        return True
    if h.startswith("10.") or h.startswith("192.168.") or h.startswith("172."):
        return True
    return False

def extract_host_from_server(server: Server) -> str:
    """Extract public domain or IP address from server attributes."""
    if server.external_domain and not is_private_or_local_host(server.external_domain):
        return server.external_domain.strip().split(":")[0]
        
    raw = (server.api_url or "").replace("https://", "").replace("http://", "").rstrip("/")
    domain_part = raw.split("/")[0].split(":")[0]
    return domain_part.strip()

async def resolve_country_from_ip_api(host: str, session: aiohttp.ClientSession) -> Optional[Tuple[str, str, str]]:
    """Query ip-api.com for country code and name."""
    try:
        # If host is empty or private, querying without param returns caller's public IP
        query_url = f"http://ip-api.com/json/{host}?fields=status,country,countryCode" if host else "http://ip-api.com/json/?fields=status,country,countryCode"
        async with session.get(query_url, timeout=aiohttp.ClientTimeout(total=4)) as resp:
            if resp.status == 200:
                data = await resp.json()
                if data.get("status") == "success" and data.get("countryCode"):
                    cc = data.get("countryCode", "").upper()
                    cname = data.get("country", "")
                    return cc, cname, get_flag_emoji(cc)
    except Exception as e:
        logger.debug(f"ip-api lookup failed for {host}: {e}")
    return None

async def resolve_country_from_ipwhois(host: str, session: aiohttp.ClientSession) -> Optional[Tuple[str, str, str]]:
    """Fallback query to ipwho.is for country code and name."""
    try:
        query_url = f"https://ipwho.is/{host}" if host else "https://ipwho.is/"
        async with session.get(query_url, timeout=aiohttp.ClientTimeout(total=4)) as resp:
            if resp.status == 200:
                data = await resp.json()
                if data.get("success") and data.get("country_code"):
                    cc = data.get("country_code", "").upper()
                    cname = data.get("country", "")
                    return cc, cname, get_flag_emoji(cc)
    except Exception as e:
        logger.debug(f"ipwhois lookup failed for {host}: {e}")
    return None

async def detect_server_country(server: Server) -> Tuple[str, str, str]:
    """
    Detects server country code, name, and flag emoji.
    Returns (country_code, country_name, flag_emoji). Example: ('SG', 'Singapore', '🇸🇬')
    """
    # 1. Check existing DB values if set
    cc = getattr(server, "country_code", None)
    cname = getattr(server, "country_name", None)
    if cc and len(cc) == 2:
        return cc.upper(), cname or cc, get_flag_emoji(cc)
        
    host = extract_host_from_server(server)
    if is_private_or_local_host(host):
        host = "" # Trigger self public IP lookup
        
    cache_key = host or "self_public_ip"
    if cache_key in _GEO_CACHE:
        return _GEO_CACHE[cache_key]
        
    async with aiohttp.ClientSession() as session:
        # Try primary provider
        res = await resolve_country_from_ip_api(host, session)
        if not res:
            # Try secondary fallback provider
            res = await resolve_country_from_ipwhois(host, session)
            
    if res:
        _GEO_CACHE[cache_key] = res
        return res
        
    # Default fallback
    fallback = ("UN", "Global", "🌐")
    _GEO_CACHE[cache_key] = fallback
    return fallback
