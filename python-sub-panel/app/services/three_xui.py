import asyncio
import logging
import json
import base64
import re
import urllib.parse
import uuid
import secrets
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
import aiohttp
from sqlalchemy.orm import Session
from cryptography.hazmat.primitives.asymmetric import x25519
from app.models import Server, Client, ClientKey
from app.services.geo import get_flag_emoji

logger = logging.getLogger(__name__)

# Production-ready fast API request timeouts (8s total, 3s connect)
DEFAULT_TIMEOUT = aiohttp.ClientTimeout(total=8, connect=3)


def derive_x25519_public_key(priv_key_str: str) -> str:
    """
    Derive base64-urlsafe X25519 public key (pbk) from privateKey string.
    This guarantees Reality pbk is never missing even if not stored explicitly in inbound settings.
    """
    if not priv_key_str:
        return ""
    try:
        padded = priv_key_str + "=" * (-len(priv_key_str) % 4)
        try:
            priv_bytes = base64.urlsafe_b64decode(padded)
        except Exception:
            priv_bytes = base64.b64decode(padded)
        if len(priv_bytes) != 32:
            return ""
        priv_obj = x25519.X25519PrivateKey.from_private_bytes(priv_bytes)
        pub_bytes = priv_obj.public_key().public_bytes_raw()
        return base64.urlsafe_b64encode(pub_bytes).decode().rstrip("=")
    except Exception as e:
        logger.warning(f"3x-ui: Failed to derive x25519 public key: {e}")
        return ""


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


def get_ssl_setting(server: Any) -> bool:
    """
    Determine SSL verification setting.
    Always returns False to seamlessly support self-signed certificates on 3x-ui panels.
    """
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


async def login_3xui_standalone(server: Any) -> Tuple[Optional[str], str]:
    """Standalone 3x-ui login helper returning (api_base, error_message)."""
    ssl_verify = get_ssl_setting(server)
    try:
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            api_base, headers = await login_3xui(session, server)
            if api_base:
                return api_base, "Login successful"
            return None, "Invalid 3x-ui username, password, or panel URL"
    except Exception as e:
        return None, str(e)


async def login_3xui(session: aiohttp.ClientSession, server: Server, timeout: Optional[aiohttp.ClientTimeout] = None) -> Tuple[Optional[str], Dict[str, str]]:
    """Login to 3x-ui panel and return (working api_base URL, authenticated headers), or (None, {}) on failure."""
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
                headers=headers,
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
                        return api_base, headers

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
    return None, {}


def generate_inbound_access_url(
    target_inbound: dict,
    server: Server,
    client: Client,
    client_uuid: str,
    sub_id: str,
    ext_host: str,
    ext_port: int
) -> Optional[str]:
    """
    Build standardized node access URL for a specific 3x-ui inbound matching 1:1 official 3x-ui panel export.
    Supports VLESS (TCP, WS, gRPC, XHTTP/SplitHTTP, HTTP/H2, KCP, QUIC), VMess, Trojan, Shadowsocks, Hysteria2, TUIC.
    """
    try:
        protocol = (target_inbound.get("protocol") or "vless").lower()
        inbound_port = target_inbound.get("port") or ext_port
        inbound_remark = (target_inbound.get("remark") or "").strip()

        stream_raw = target_inbound.get("streamSettings", "{}")
        try:
            stream = json.loads(stream_raw) if isinstance(stream_raw, str) else (stream_raw or {})
        except Exception:
            stream = {}

        inb_settings_raw = target_inbound.get("settings", "{}")
        try:
            inb_settings = json.loads(inb_settings_raw) if isinstance(inb_settings_raw, str) else (inb_settings_raw or {})
        except Exception:
            inb_settings = {}

        net = stream.get("network", "tcp")
        security = stream.get("security", "none")
        path = ""
        host_header = ""
        sni = ext_host
        pbk = ""
        fp = "chrome"
        sid = ""
        alpn = ""
        spx = ""
        header_type = "none"
        seed = ""
        quic_security = "none"
        quic_key = ""
        grpc_mode = ""
        xhttp_mode = "auto"
        x_padding_bytes = ""
        extra_json = ""

        # -------------------------------------------------------------
        # 1. Transport Settings (network: tcp, ws, grpc, xhttp, http, kcp, quic)
        # -------------------------------------------------------------
        if net == "tcp":
            tcp_settings = stream.get("tcpSettings", {})
            header_obj = tcp_settings.get("header", {})
            header_type = header_obj.get("type", "none")
            if header_type == "http":
                req = header_obj.get("request", {})
                paths = req.get("path", [])
                if isinstance(paths, list) and paths:
                    path = paths[0]
                elif isinstance(paths, str):
                    path = paths
                req_headers = req.get("headers", {})
                hosts = req_headers.get("Host") or req_headers.get("host") or []
                if isinstance(hosts, list) and hosts:
                    host_header = hosts[0]
                elif isinstance(hosts, str):
                    host_header = hosts

        elif net == "ws":
            ws_settings = stream.get("wsSettings", {})
            path = ws_settings.get("path", "/")
            ws_headers = ws_settings.get("headers", {})
            host_header = ws_headers.get("Host") or ws_headers.get("host") or ""

        elif net == "grpc":
            grpc_settings = stream.get("grpcSettings", {})
            path = grpc_settings.get("serviceName", "")
            if grpc_settings.get("multiMode"):
                grpc_mode = "multi"

        elif net in ["xhttp", "splithttp"]:
            xhttp_settings = stream.get("xhttpSettings") or stream.get("splithttpSettings") or {}
            path = xhttp_settings.get("path", "/")
            host_header = xhttp_settings.get("host", "")
            xhttp_mode = xhttp_settings.get("mode", "auto")
            x_padding_bytes = xhttp_settings.get("xPaddingBytes") or xhttp_settings.get("x_padding_bytes") or ""
            extra_dict = {}
            if xhttp_mode:
                extra_dict["mode"] = xhttp_mode
            if x_padding_bytes:
                extra_dict["xPaddingBytes"] = x_padding_bytes
            if extra_dict:
                extra_json = json.dumps(extra_dict, separators=(',', ':'))

        elif net in ["http", "h2"]:
            http_settings = stream.get("httpSettings", {})
            path = http_settings.get("path", "/")
            hosts = http_settings.get("host") or http_settings.get("headers", {}).get("Host") or http_settings.get("headers", {}).get("host") or []
            if isinstance(hosts, list) and hosts:
                host_header = hosts[0]
            elif isinstance(hosts, str):
                host_header = hosts

        elif net == "kcp":
            kcp_settings = stream.get("kcpSettings", {})
            header_type = kcp_settings.get("header", {}).get("type", "none")
            seed = kcp_settings.get("seed", "")

        elif net == "quic":
            quic_settings = stream.get("quicSettings", {})
            quic_security = quic_settings.get("security", "none")
            quic_key = quic_settings.get("key", "")
            header_type = quic_settings.get("header", {}).get("type", "none")

        # -------------------------------------------------------------
        # 2. Security Settings (tls, reality, none)
        # -------------------------------------------------------------
        if security == "tls":
            tls_settings = stream.get("tlsSettings", {})
            original_domain = parse_server_host_port(server)[0]
            sni = tls_settings.get("serverName") or tls_settings.get("sni") or original_domain
            fp = tls_settings.get("fingerprint") or "chrome"
            tls_alpn = tls_settings.get("alpn")
            if tls_alpn:
                if isinstance(tls_alpn, list):
                    alpn = ",".join(tls_alpn)
                elif isinstance(tls_alpn, str):
                    alpn = tls_alpn

        elif security == "reality":
            real = stream.get("realitySettings", {})
            real_settings = real.get("settings", {}) if isinstance(real.get("settings"), dict) else {}

            # Public Key (pbk)
            pbk = real_settings.get("publicKey") or real.get("publicKey") or ""
            if not pbk and real.get("privateKey"):
                pbk = derive_x25519_public_key(real.get("privateKey"))

            # Fingerprint (fp)
            fp = real_settings.get("fingerprint") or real.get("fingerprint") or "chrome"

            # SNI / serverNames
            snis = real.get("serverNames", [])
            if isinstance(snis, list) and snis:
                sni = snis[0]
            elif isinstance(snis, str) and snis:
                sni = snis.split(",")[0].strip()
            else:
                sni = real_settings.get("serverName") or (real.get("dest", "").split(":")[0] if ":" in real.get("dest", "") else real.get("dest", "")) or ext_host

            # Short IDs (sid)
            sids = real.get("shortIds", [])
            if isinstance(sids, list) and sids:
                sid = sids[0]
            elif isinstance(sids, str) and sids:
                sid = sids.split(",")[0].strip()
            else:
                sid = ""

            # SpiderX (spx)
            spx = (
                real.get("spiderX") or
                real_settings.get("spiderX") or
                real.get("SpiderX") or
                real_settings.get("SpiderX") or
                real.get("spiderx") or
                real_settings.get("spiderx") or
                real.get("spx") or
                real_settings.get("spx") or
                inb_settings.get("spiderX") or
                inb_settings.get("spx") or
                target_inbound.get("spiderX") or
                ""
            )

        # Parse externalProxy for Nginx / reverse proxy TLS settings
        ext_proxy_list = stream.get("externalProxy", [])
        if ext_proxy_list and isinstance(ext_proxy_list, list):
            eproxy = ext_proxy_list[0]
            if eproxy.get("forceTls"):
                security = eproxy.get("forceTls")
            if eproxy.get("port") and not server.external_port:
                inbound_port = eproxy.get("port")
            if eproxy.get("dest") and not server.external_domain:
                dest_val = eproxy.get("dest")
                if not re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', dest_val):
                    ext_host = dest_val
            if eproxy.get("sni"):
                dest_val = eproxy.get("dest") or ""
                if not re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', dest_val):
                    sni = eproxy.get("sni")
            if eproxy.get("fingerprint"):
                fp = eproxy.get("fingerprint")
            if eproxy.get("alpn"):
                val_alpn = eproxy.get("alpn")
                if isinstance(val_alpn, list):
                    alpn = ",".join(val_alpn)
                elif isinstance(val_alpn, str):
                    alpn = val_alpn

        # Format node display name with remark and flag
        flag = get_flag_emoji(server.country_code)
        if inbound_remark:
            node_tag = f"[{inbound_remark}]"
        else:
            node_tag = f"[{protocol.upper()}-{inbound_port}]"
        node_title = f"{flag} {server.name} {node_tag} - {client.name}" if flag else f"{server.name} {node_tag} - {client.name}"

        # -------------------------------------------------------------
        # 3. Protocol-Specific URL Construction (1:1 with 3x-ui standard)
        # -------------------------------------------------------------
        if protocol == "vless":
            params = []
            
            # Transport network
            params.append(f"type={net}")
            
            # Security
            if security and security != "none":
                params.append(f"security={security}")
            else:
                params.append("security=none")
            
            # Transport specific parameters
            if net == "tcp":
                if header_type and header_type != "none":
                    params.append(f"headerType={header_type}")
                    if header_type == "http":
                        if path:
                            params.append(f"path={urllib.parse.quote(path, safe='')}")
                        if host_header:
                            params.append(f"host={urllib.parse.quote(host_header, safe='')}")
            elif net == "ws":
                if path:
                    params.append(f"path={urllib.parse.quote(path, safe='')}")
                if host_header:
                    params.append(f"host={urllib.parse.quote(host_header, safe='')}")
            elif net == "grpc":
                if path:
                    params.append(f"serviceName={urllib.parse.quote(path, safe='')}")
                if grpc_mode:
                    params.append(f"mode={grpc_mode}")
            elif net in ["xhttp", "splithttp"]:
                if path:
                    params.append(f"path={urllib.parse.quote(path, safe='')}")
                if host_header is not None:
                    params.append(f"host={urllib.parse.quote(host_header, safe='')}")
                if xhttp_mode:
                    params.append(f"mode={xhttp_mode}")
                if x_padding_bytes:
                    params.append(f"x_padding_bytes={urllib.parse.quote(x_padding_bytes, safe='')}")
                if extra_json:
                    params.append(f"extra={urllib.parse.quote(extra_json, safe='')}")
            elif net in ["http", "h2"]:
                if path:
                    params.append(f"path={urllib.parse.quote(path, safe='')}")
                if host_header:
                    params.append(f"host={urllib.parse.quote(host_header, safe='')}")
            elif net == "kcp":
                if header_type and header_type != "none":
                    params.append(f"headerType={header_type}")
                if seed:
                    params.append(f"seed={urllib.parse.quote(seed, safe='')}")
            elif net == "quic":
                if quic_security and quic_security != "none":
                    params.append(f"quicSecurity={quic_security}")
                if quic_key:
                    params.append(f"key={urllib.parse.quote(quic_key, safe='')}")
                if header_type and header_type != "none":
                    params.append(f"headerType={header_type}")

            # Security specific parameters
            if security == "reality":
                params.insert(0, "encryption=none")  # encryption=none at beginning matching 3x-ui
                if pbk:
                    params.append(f"pbk={urllib.parse.quote(pbk, safe='')}")
                if fp:
                    params.append(f"fp={fp}")
                if sni:
                    params.append(f"sni={urllib.parse.quote(sni, safe='')}")
                if sid:
                    params.append(f"sid={urllib.parse.quote(sid, safe='')}")
                if spx:
                    params.append(f"spx={urllib.parse.quote(spx, safe='')}")
                # FLOW: Strictly only for TCP transport!
                if net == "tcp":
                    params.append("flow=xtls-rprx-vision")
            elif security == "tls":
                params.insert(0, "encryption=none")
                if sni:
                    params.append(f"sni={urllib.parse.quote(sni, safe='')}")
                if fp:
                    params.append(f"fp={fp}")
                if alpn:
                    params.append(f"alpn={urllib.parse.quote(alpn, safe='')}")
                # FLOW: Strictly only for TCP transport!
                if net == "tcp":
                    params.append("flow=xtls-rprx-vision")
            else:
                # security == "none"
                pass

            query_string = "&".join(params)
            return f"vless://{client_uuid}@{ext_host}:{inbound_port}?{query_string}#{node_title}"

        elif protocol == "vmess":
            vmess_type = header_type if net in ["tcp", "kcp", "quic"] else "none"
            vmess_host = host_header if net in ["ws", "http", "h2", "xhttp", "splithttp"] else ""
            vmess_path = path if net in ["ws", "http", "h2", "grpc", "xhttp", "splithttp"] else ""
            vmess_tls = security if security in ["tls", "reality"] else ""
            vmess_sni = sni if security in ["tls", "reality"] else ""
            vmess_alpn = alpn if security == "tls" and alpn else ""
            vmess_fp = fp if security in ["tls", "reality"] else ""

            vmess_dic = {
                "v": "2",
                "ps": node_title,
                "add": ext_host,
                "port": str(inbound_port),
                "id": client_uuid,
                "aid": "0",
                "scy": "auto",
                "net": net,
                "type": vmess_type,
                "host": vmess_host,
                "path": vmess_path,
                "tls": vmess_tls,
                "sni": vmess_sni,
                "alpn": vmess_alpn,
                "fp": vmess_fp
            }
            return "vmess://" + base64.b64encode(json.dumps(vmess_dic, separators=(',', ':')).encode()).decode()

        elif protocol == "trojan":
            params = []
            params.append(f"type={net}")
            if security and security != "none":
                params.append(f"security={security}")
            if sni and security != "none":
                params.append(f"sni={urllib.parse.quote(sni, safe='')}")
            if fp and security != "none":
                params.append(f"fp={fp}")
            if alpn and security == "tls":
                params.append(f"alpn={urllib.parse.quote(alpn, safe='')}")
            if path:
                if net == "grpc":
                    params.append(f"serviceName={urllib.parse.quote(path, safe='')}")
                else:
                    params.append(f"path={urllib.parse.quote(path, safe='')}")
            if host_header and net in ["ws", "http", "h2", "xhttp"]:
                params.append(f"host={urllib.parse.quote(host_header, safe='')}")
            if net == "grpc" and grpc_mode:
                params.append(f"mode={grpc_mode}")
            
            query_string = "&".join(params)
            return f"trojan://{client_uuid}@{ext_host}:{inbound_port}?{query_string}#{node_title}"

        elif protocol in ["shadowsocks", "ss"]:
            method = inb_settings.get("method", "aes-256-gcm")
            password = inb_settings.get("password") or client_uuid
            user_info = base64.b64encode(f"{method}:{password}".encode()).decode()
            return f"ss://{user_info}@{ext_host}:{inbound_port}#{node_title}"

        elif protocol in ["hysteria", "hysteria2", "hy2"]:
            tls_settings = stream.get("tlsSettings", {})
            sni_val = tls_settings.get("serverName") or tls_settings.get("sni") or sni or ext_host
            
            alpn_val = "h3"
            tls_alpn = tls_settings.get("alpn")
            if tls_alpn:
                if isinstance(tls_alpn, list):
                    alpn_val = ",".join(tls_alpn)
                elif isinstance(tls_alpn, str):
                    alpn_val = tls_alpn

            hy_stream = stream.get("hysteriaSettings") or stream.get("hysteria2Settings") or {}
            
            # Check for existing client auth/password in 3x-ui inbound settings
            ib_id_val = str(target_inbound.get("id", ""))
            candidate_emails = {
                client.name,
                f"{client.name}_{ib_id_val}",
                f"{client.name}_{inbound_port}",
                f"{client.name}_1",
                f"{client.name}_2",
                f"{client.name}_3"
            }
            existing_auth = None
            for cl in inb_settings.get("clients", []):
                if cl.get("email") in candidate_emails:
                    existing_auth = cl.get("auth") or cl.get("password") or cl.get("id")
                    if existing_auth:
                        break
            
            auth_to_use = existing_auth or client_uuid
            
            # mport
            mport_val = hy_stream.get("ports") or hy_stream.get("mport") or inb_settings.get("ports") or inb_settings.get("mport") or target_inbound.get("ports") or ""
            
            # obfs & obfs-password
            obfs_type = hy_stream.get("obfs") or hy_stream.get("obfsType") or inb_settings.get("obfs") or inb_settings.get("obfsType") or stream.get("obfs") or inb_settings.get("obfs_type") or ""
            obfs_pwd = hy_stream.get("obfsPassword") or hy_stream.get("obfs-password") or inb_settings.get("obfsPassword") or inb_settings.get("obfs-password") or stream.get("obfsPassword") or inb_settings.get("obfs_password") or ""

            # Fingerprint
            fp_val = tls_settings.get("fingerprint") or real_settings.get("fingerprint") if 'real_settings' in locals() else "chrome"
            if not fp_val:
                fp_val = "chrome"

            query_parts = []
            if alpn_val:
                query_parts.append(f"alpn={urllib.parse.quote(alpn_val)}")
            if fp_val:
                query_parts.append(f"fp={urllib.parse.quote(fp_val)}")
            if mport_val:
                query_parts.append(f"mport={urllib.parse.quote(str(mport_val))}")
            if obfs_type:
                query_parts.append(f"obfs={urllib.parse.quote(str(obfs_type))}")
            if obfs_pwd:
                query_parts.append(f"obfs-password={urllib.parse.quote(str(obfs_pwd))}")
            query_parts.append(f"security={security or 'tls'}")
            if sni_val:
                query_parts.append(f"sni={urllib.parse.quote(sni_val)}")
            if not server.ssl_verify:
                query_parts.append("insecure=1")

            q_str = "&".join(query_parts)
            return f"hysteria2://{auth_to_use}@{ext_host}:{inbound_port}?{q_str}#{node_title}"

        elif protocol == "tuic":
            tls_settings = stream.get("tlsSettings", {})
            sni_val = tls_settings.get("serverName") or sni or ext_host
            return f"tuic://{client_uuid}:{client_uuid}@{ext_host}:{inbound_port}?congestion_control=bbr&sni={sni_val}#{node_title}"

        else:
            return f"vless://{client_uuid}@{ext_host}:{inbound_port}?type={net}&security={security}#{node_title}"

    except Exception as e:
        logger.error(f"3x-ui generate_inbound_access_url error: {e}")
        return None


async def add_3xui_client_all_inbounds(server: Server, client: Client, client_uuid: str, sub_id: str) -> List[Dict[str, Any]]:
    """
    Add client to all applicable inbounds on the 3x-ui server and return generated keys for each inbound.
    If server.inbound_id is specified, targets only that inbound.
    Otherwise, extracts and generates keys for ALL inbounds.
    """
    ext_host, ext_port = parse_server_host_port(server)
    ssl_verify = get_ssl_setting(server)
    generated_keys: List[Dict[str, Any]] = []

    try:
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            api_base, headers = await login_3xui(session, server)
            if not api_base:
                logger.error(f"3x-ui: Cannot login for server {server.name}")
                return []

            # Step 1: Fetch all inbounds list
            inbound_list = []
            list_url = build_url(api_base, "panel/api/inbounds/list")
            try:
                async with session.get(
                    list_url,
                    headers=headers,
                    timeout=DEFAULT_TIMEOUT,
                    ssl=ssl_verify
                ) as list_resp:
                    if list_resp.status == 200:
                        ldata = await list_resp.json()
                        if ldata.get("success"):
                            inbound_list = ldata.get("obj", [])
            except Exception as e:
                logger.error(f"3x-ui error fetching inbounds list for {server.name}: {e}")

            # Filter inbounds
            target_inbounds = []
            if server.inbound_id:
                for inb in inbound_list:
                    if str(inb.get("id")) == str(server.inbound_id):
                        target_inbounds.append(inb)
                        break
                if not target_inbounds:
                    # Single get fallback
                    get_inbound_url = build_url(api_base, f"panel/api/inbounds/get/{server.inbound_id}")
                    try:
                        async with session.get(
                            get_inbound_url,
                            headers=headers,
                            timeout=DEFAULT_TIMEOUT,
                            ssl=ssl_verify
                        ) as get_resp:
                            if get_resp.status == 200:
                                gdata = await get_resp.json()
                                if gdata.get("success") and gdata.get("obj"):
                                    target_inbounds.append(gdata.get("obj"))
                    except Exception as e:
                        logger.error(f"3x-ui: Failed to get inbound {server.inbound_id}: {e}")
            else:
                # Include all inbounds from list
                target_inbounds = inbound_list

            if not target_inbounds:
                logger.warning(f"3x-ui: No inbounds found on {server.name}")
                return []

            for target_inbound in target_inbounds:
                ib_id = target_inbound.get("id")
                if ib_id is None:
                    continue

                try:
                    ib_id_int = int(ib_id)
                except (ValueError, TypeError):
                    ib_id_int = 1

                stream_raw = target_inbound.get("streamSettings", "{}")
                try:
                    stream = json.loads(stream_raw) if isinstance(stream_raw, str) else (stream_raw or {})
                except Exception:
                    stream = {}

                protocol = (target_inbound.get("protocol") or "vless").lower()
                security = stream.get("security", "none")

                # Build client email and traffic limits
                client_email = f"{client.name}_{ib_id_int}" if len(target_inbounds) > 1 else client.name
                total_bytes = int(client.data_limit_gb * 1024 * 1024 * 1024) if client.data_limit_gb else 0

                # Pre-clean any existing client with matching email, subId, or UUID in this inbound
                inb_settings_raw = target_inbound.get("settings", "{}")
                try:
                    inb_settings = json.loads(inb_settings_raw) if isinstance(inb_settings_raw, str) else (inb_settings_raw or {})
                except Exception:
                    inb_settings = {}

                existing_clients = inb_settings.get("clients", [])
                for cl in existing_clients:
                    cl_email = cl.get("email", "")
                    cl_id = cl.get("id") or cl.get("password") or cl.get("auth")
                    if cl_email in (client.name, client_email, f"{client.name}_{ib_id_int}") or cl_id == client_uuid:
                        if cl_id:
                            for del_ep in [
                                f"panel/api/inbounds/{ib_id_int}/delClient/{cl_id}",
                                f"panel/inbound/{ib_id_int}/delClient/{cl_id}",
                                f"xui/inbound/{ib_id_int}/delClient/{cl_id}"
                            ]:
                                try:
                                    async with session.post(build_url(api_base, del_ep), headers=headers, timeout=DEFAULT_TIMEOUT, ssl=ssl_verify) as del_resp:
                                        if del_resp.status == 200:
                                            logger.info(f"3x-ui: Cleaned up prior client {cl_email} ({cl_id}) on inbound {ib_id_int}")
                                            break
                                except Exception:
                                    pass

                # Build client data payload strictly matching protocol schema
                if protocol == "vless":
                    flow_val = ""
                    if net == "tcp" and security in ["reality", "tls"]:
                        existing_flows = [cl.get("flow") for cl in existing_clients if cl.get("flow")]
                        flow_val = existing_flows[0] if existing_flows else "xtls-rprx-vision"

                    c_data = {
                        "id": client_uuid,
                        "flow": flow_val,
                        "email": client_email,
                        "limitIp": 0,
                        "totalGB": total_bytes,
                        "expiryTime": 0,
                        "enable": True,
                        "subId": sub_id
                    }
                elif protocol == "vmess":
                    c_data = {
                        "id": client_uuid,
                        "alterId": 0,
                        "email": client_email,
                        "limitIp": 0,
                        "totalGB": total_bytes,
                        "expiryTime": 0,
                        "enable": True,
                        "subId": sub_id
                    }
                elif protocol in ["hysteria", "hysteria2", "hy2", "tuic"]:
                    c_data = {
                        "auth": client_uuid,
                        "password": client_uuid,
                        "id": client_uuid,
                        "email": client_email,
                        "limitIp": 0,
                        "totalGB": total_bytes,
                        "expiryTime": 0,
                        "enable": True,
                        "subId": sub_id
                    }
                elif protocol in ["trojan", "shadowsocks", "ss"]:
                    c_data = {
                        "password": client_uuid,
                        "email": client_email,
                        "limitIp": 0,
                        "totalGB": total_bytes,
                        "expiryTime": 0,
                        "enable": True,
                        "subId": sub_id
                    }
                else:
                    c_data = {
                        "id": client_uuid,
                        "password": client_uuid,
                        "email": client_email,
                        "limitIp": 0,
                        "totalGB": total_bytes,
                        "expiryTime": 0,
                        "enable": True,
                        "subId": sub_id
                    }

                added = False

                # Candidate addClient endpoints (direct and fallback)
                add_endpoints = [
                    "panel/api/inbounds/addClient",
                    "panel/inbound/addClient",
                    f"panel/api/inbounds/{ib_id_int}/addClient",
                ]

                for ep in add_endpoints:
                    if added:
                        break
                    add_client_url = build_url(api_base, ep)
                    for payload in [
                        {"id": ib_id_int, "settings": json.dumps({"clients": [c_data]})},
                        {"id": ib_id_int, "settings": {"clients": [c_data]}},
                    ]:
                        if added:
                            break
                        try:
                            json_headers = dict(headers)
                            json_headers["Content-Type"] = "application/json"
                            async with session.post(
                                add_client_url,
                                json=payload,
                                headers=json_headers,
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
                                        logger.info(f"3x-ui: Client added to inbound {ib_id_int} via {ep} on {server.name}")
                                        break
                        except Exception as e:
                            logger.debug(f"3x-ui addClient {ep} error: {e}")

                # Method 3: Inbound update fallback (/panel/api/inbounds/update/{id} or /panel/inbound/update/{id})
                if not added:
                    for get_ep, upd_ep in [
                        (f"panel/api/inbounds/get/{ib_id_int}", f"panel/api/inbounds/update/{ib_id_int}"),
                        (f"panel/inbound/get/{ib_id_int}", f"panel/inbound/update/{ib_id_int}"),
                    ]:
                        if added:
                            break
                        get_inb_url = build_url(api_base, get_ep)
                        update_inb_url = build_url(api_base, upd_ep)
                        try:
                            async with session.get(
                                get_inb_url,
                                headers=headers,
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
                                        existing_clients = [cl for cl in existing_clients if cl.get("email") != client.name and cl.get("email") != client_email and cl.get("id") != client_uuid]
                                        existing_clients.append(c_data)
                                        inb_settings["clients"] = existing_clients
                                        inb_obj["settings"] = json.dumps(inb_settings)

                                        # Try JSON update
                                        json_headers = dict(headers)
                                        json_headers["Content-Type"] = "application/json"
                                        async with session.post(
                                            update_inb_url,
                                            json=inb_obj,
                                            headers=json_headers,
                                            timeout=DEFAULT_TIMEOUT,
                                            ssl=ssl_verify
                                        ) as update_resp:
                                            if update_resp.status == 200:
                                                ures = await update_resp.json()
                                                if ures.get("success"):
                                                    added = True
                                                    logger.info(f"3x-ui: Client added via inbound update (JSON) for {server.name} (inbound {ib_id_int})")
                                                    break

                                        # Try Form-urlencoded update
                                        if not added:
                                            form_headers = dict(headers)
                                            form_headers["Content-Type"] = "application/x-www-form-urlencoded"
                                            form_data = {k: str(v) if not isinstance(v, str) else v for k, v in inb_obj.items()}
                                            async with session.post(
                                                update_inb_url,
                                                data=form_data,
                                                headers=form_headers,
                                                timeout=DEFAULT_TIMEOUT,
                                                ssl=ssl_verify
                                            ) as form_upd_resp:
                                                if form_upd_resp.status == 200:
                                                    fures = await form_upd_resp.json()
                                                    if fures.get("success"):
                                                        added = True
                                                        logger.info(f"3x-ui: Client added via inbound update (Form) for {server.name} (inbound {ib_id_int})")
                                                        break
                        except Exception as e:
                            logger.error(f"3x-ui inbound update fallback error for inbound {ib_id_int}: {e}")

                # Fetch full inbound object for accurate reality/stream settings when building URL
                full_inbound = target_inbound
                if added:
                    for get_ep in [f"panel/api/inbounds/get/{ib_id_int}", f"panel/inbound/get/{ib_id_int}"]:
                        try:
                            async with session.get(build_url(api_base, get_ep), headers=headers, timeout=DEFAULT_TIMEOUT, ssl=ssl_verify) as g_resp:
                                if g_resp.status == 200:
                                    g_json = await g_resp.json()
                                    if g_json.get("success") and g_json.get("obj"):
                                        full_inbound = g_json.get("obj")
                                        break
                        except Exception:
                            pass

                # Generate access URL for this inbound
                access_url = generate_inbound_access_url(
                    full_inbound, server, client, client_uuid, sub_id, ext_host, ext_port
                )
                if access_url:
                    generated_keys.append({
                        "access_url": access_url,
                        "inbound_id": ib_id_int,
                        "inbound_remark": full_inbound.get("remark", ""),
                        "protocol": full_inbound.get("protocol", "vless"),
                        "uuid": client_uuid,
                        "sub_id": sub_id
                    })

    except Exception as e:
        logger.error(f"3x-ui add_3xui_client_all_inbounds error for {server.name}: {e}")

    return generated_keys


async def add_3xui_client(server: Server, client: Client, client_uuid: str, sub_id: str) -> Optional[str]:
    """Backwards-compatible helper returning the primary access URL."""
    keys = await add_3xui_client_all_inbounds(server, client, client_uuid, sub_id)
    if keys:
        return keys[0].get("access_url")
    return None


async def delete_3xui_client(server: Server, client_uuid: str) -> bool:
    """Delete client from all inbounds on the 3x-ui server."""
    ssl_verify = get_ssl_setting(server)
    try:
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            api_base, headers = await login_3xui(session, server)
            if not api_base:
                return False

            # Fetch all inbounds
            list_url = build_url(api_base, "panel/api/inbounds/list")
            inbound_ids = []
            try:
                async with session.get(
                    list_url,
                    headers=headers,
                    timeout=DEFAULT_TIMEOUT,
                    ssl=ssl_verify
                ) as list_resp:
                    if list_resp.status == 200:
                        ldata = await list_resp.json()
                        if ldata.get("success"):
                            inbound_ids = [inb.get("id") for inb in ldata.get("obj", []) if inb.get("id") is not None]
            except Exception:
                pass

            if not inbound_ids and server.inbound_id:
                inbound_ids = [server.inbound_id]
            elif not inbound_ids:
                inbound_ids = [1]

            deleted_any = False
            for ib_id in inbound_ids:
                try:
                    ib_id_int = int(ib_id)
                except Exception:
                    ib_id_int = 1

                # Method 1: direct delete endpoint
                del_url = build_url(api_base, f"panel/api/inbounds/{ib_id_int}/delClient/{client_uuid}")
                del_success = False
                try:
                    async with session.post(
                        del_url,
                        headers=headers,
                        timeout=DEFAULT_TIMEOUT,
                        ssl=ssl_verify
                    ) as del_resp:
                        if del_resp.status == 200:
                            res = await del_resp.json()
                            if res.get("success"):
                                del_success = True
                                deleted_any = True
                except Exception:
                    pass

                # Method 2: update inbound settings fallback
                if not del_success:
                    get_inb_url = build_url(api_base, f"panel/api/inbounds/get/{ib_id_int}")
                    update_inb_url = build_url(api_base, f"panel/api/inbounds/update/{ib_id_int}")
                    try:
                        async with session.get(
                            get_inb_url,
                            headers=headers,
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
                                    new_clients = [
                                        cl for cl in existing_clients
                                        if not any(
                                            str(cl.get(field, "")) == str(client_uuid)
                                            for field in ("id", "password", "subId")
                                        )
                                    ]
                                    if len(new_clients) != len(existing_clients):
                                        inb_settings["clients"] = new_clients
                                        inb_obj["settings"] = json.dumps(inb_settings)

                                        async with session.post(
                                            update_inb_url,
                                            json=inb_obj,
                                            headers=headers,
                                            timeout=DEFAULT_TIMEOUT,
                                            ssl=ssl_verify
                                        ) as update_resp:
                                            if update_resp.status == 200:
                                                ures = await update_resp.json()
                                                if ures.get("success"):
                                                    deleted_any = True
                    except Exception as e:
                        logger.error(f"3x-ui delete fallback error for inbound {ib_id_int}: {e}")

            return deleted_any
    except Exception as e:
        logger.error(f"3x-ui delete client root error: {e}")
        return False


async def set_3xui_client_enabled(server: Server, client_uuid: str, enabled: bool) -> bool:
    """Enable or disable a client across all inbounds on 3x-ui panel."""
    ssl_verify = get_ssl_setting(server)
    try:
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            api_base, headers = await login_3xui(session, server)
            if not api_base:
                return False

            # Fetch all inbounds
            list_url = build_url(api_base, "panel/api/inbounds/list")
            inbound_ids = []
            try:
                async with session.get(
                    list_url,
                    headers=headers,
                    timeout=DEFAULT_TIMEOUT,
                    ssl=ssl_verify
                ) as list_resp:
                    if list_resp.status == 200:
                        ldata = await list_resp.json()
                        if ldata.get("success"):
                            inbound_ids = [inb.get("id") for inb in ldata.get("obj", []) if inb.get("id") is not None]
            except Exception:
                pass

            if not inbound_ids and server.inbound_id:
                inbound_ids = [server.inbound_id]
            elif not inbound_ids:
                inbound_ids = [1]

            updated_any = False
            for ib_id in inbound_ids:
                try:
                    ib_id_int = int(ib_id)
                except Exception:
                    ib_id_int = 1

                get_inb_url = build_url(api_base, f"panel/api/inbounds/get/{ib_id_int}")
                update_inb_url = build_url(api_base, f"panel/api/inbounds/update/{ib_id_int}")

                try:
                    async with session.get(
                        get_inb_url,
                        headers=headers,
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
                                client_found = False
                                for c in clients_list:
                                    if c.get("id") == client_uuid or c.get("password") == client_uuid:
                                        c["enable"] = enabled
                                        client_found = True

                                if client_found:
                                    inb_settings["clients"] = clients_list
                                    inb_obj["settings"] = json.dumps(inb_settings)

                                    async with session.post(
                                        update_inb_url,
                                        json=inb_obj,
                                        headers=headers,
                                        timeout=DEFAULT_TIMEOUT,
                                        ssl=ssl_verify
                                    ) as update_resp:
                                        if update_resp.status == 200:
                                            ures = await update_resp.json()
                                            if ures.get("success"):
                                                updated_any = True
                except Exception as e:
                    logger.error(f"3x-ui set_enabled error for inbound {ib_id_int}: {e}")

            return updated_any

    except Exception as e:
        logger.error(f"3x-ui set_enabled root error: {e}")
    return False


async def delete_all_3xui_clients(server: Server) -> int:
    """Purge all clients from all inbounds on the 3x-ui server."""
    ssl_verify = get_ssl_setting(server)
    deleted_count = 0
    try:
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            api_base, headers = await login_3xui(session, server)
            if not api_base:
                return 0

            list_url = build_url(api_base, "panel/api/inbounds/list")
            try:
                async with session.get(list_url, headers=headers, timeout=DEFAULT_TIMEOUT, ssl=ssl_verify) as list_resp:
                    if list_resp.status == 200:
                        ldata = await list_resp.json()
                        if ldata.get("success"):
                            inbounds = ldata.get("obj", [])
                            for inb in inbounds:
                                ib_id = inb.get("id")
                                if ib_id is None:
                                    continue
                                try:
                                    ib_id_int = int(ib_id)
                                except Exception:
                                    ib_id_int = 1
                                
                                settings_raw = inb.get("settings", "{}")
                                try:
                                    settings = json.loads(settings_raw) if isinstance(settings_raw, str) else (settings_raw or {})
                                except Exception:
                                    settings = {}
                                
                                clients = settings.get("clients", [])
                                for cl in clients:
                                    cl_uuid = cl.get("id") or cl.get("password")
                                    if cl_uuid:
                                        for del_ep in [
                                            f"panel/api/inbounds/{ib_id_int}/delClient/{cl_uuid}",
                                            f"panel/inbound/{ib_id_int}/delClient/{cl_uuid}",
                                            f"xui/inbound/{ib_id_int}/delClient/{cl_uuid}"
                                        ]:
                                            del_url = build_url(api_base, del_ep)
                                            try:
                                                async with session.post(del_url, headers=headers, timeout=DEFAULT_TIMEOUT, ssl=ssl_verify) as del_r:
                                                    if del_r.status == 200:
                                                        rjson = await del_r.json()
                                                        if rjson.get("success"):
                                                            deleted_count += 1
                                                            break
                                            except Exception:
                                                pass
            except Exception as ex:
                logger.error(f"3x-ui delete_all_3xui_clients list error: {ex}")
    except Exception as e:
        logger.error(f"3x-ui delete_all_3xui_clients error: {e}")
    return deleted_count


async def sync_3xui_server_all_clients(server: Server, clients: List[Client], db: Session) -> Dict[str, Any]:
    """
    High-performance batch key generation for 3X-UI servers.
    Populates all inbounds with active clients in a single API update per inbound (< 1 second).
    """
    ext_host, ext_port = parse_server_host_port(server)
    ssl_verify = get_ssl_setting(server)
    
    created_count = 0
    
    try:
        jar = aiohttp.CookieJar(unsafe=True)
        fast_timeout = aiohttp.ClientTimeout(total=8, connect=3)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            api_base, headers = await login_3xui(session, server, timeout=fast_timeout)
            if not api_base:
                return {
                    "ok": False,
                    "created_keys": 0,
                    "failed_clients": [c.name for c in clients],
                    "error": f"Cannot login to 3x-ui server '{server.name}'. Check credentials."
                }
            
            # Fetch inbounds list
            inbound_list = []
            for list_ep in ["panel/api/inbounds/list", "panel/inbound/list", "xui/inbound/list"]:
                try:
                    async with session.get(build_url(api_base, list_ep), headers=headers, timeout=fast_timeout, ssl=ssl_verify) as l_resp:
                        if l_resp.status == 200:
                            lj = await l_resp.json()
                            if lj.get("success"):
                                inbound_list = lj.get("obj", [])
                                break
                except Exception:
                    pass
            
            if not inbound_list:
                return {
                    "ok": False,
                    "created_keys": 0,
                    "failed_clients": [c.name for c in clients],
                    "error": f"No inbounds found on 3x-ui server '{server.name}'."
                }
            
            now = datetime.now(timezone.utc)
            
            for inb in inbound_list:
                ib_id = inb.get("id")
                if ib_id is None:
                    continue
                try:
                    ib_id_int = int(ib_id)
                except Exception:
                    ib_id_int = 1
                
                # Fetch full inbound object
                full_inb = inb
                for get_ep in [f"panel/api/inbounds/get/{ib_id_int}", f"panel/inbound/get/{ib_id_int}"]:
                    try:
                        async with session.get(build_url(api_base, get_ep), headers=headers, timeout=fast_timeout, ssl=ssl_verify) as g_resp:
                            if g_resp.status == 200:
                                gj = await g_resp.json()
                                if gj.get("success") and gj.get("obj"):
                                    full_inb = gj.get("obj")
                                    break
                    except Exception:
                        pass
                
                stream_raw = full_inb.get("streamSettings", "{}")
                try:
                    stream = json.loads(stream_raw) if isinstance(stream_raw, str) else (stream_raw or {})
                except Exception:
                    stream = {}
                
                protocol = (full_inb.get("protocol") or "vless").lower()
                security = stream.get("security", "none")
                
                inb_settings_raw = full_inb.get("settings", "{}")
                try:
                    inb_settings = json.loads(inb_settings_raw) if isinstance(inb_settings_raw, str) else (inb_settings_raw or {})
                except Exception:
                    inb_settings = {}
                
                existing_clients = inb_settings.get("clients", [])
                
                # Prepare all client objects for this inbound
                new_inbound_clients = []
                client_keys_to_save = []
                
                for client in clients:
                    client_uuid = str(uuid.uuid4())
                    sub_id = secrets.token_hex(8)
                    client_email = f"{client.name}_{ib_id_int}" if len(inbound_list) > 1 else client.name
                    total_bytes = int(client.data_limit_gb * 1024 * 1024 * 1024) if client.data_limit_gb else 0
                    
                    if protocol == "vless":
                        flow_val = ""
                        if net == "tcp" and security in ["reality", "tls"]:
                            existing_flows = [cl.get("flow") for cl in existing_clients if cl.get("flow")]
                            flow_val = existing_flows[0] if existing_flows else "xtls-rprx-vision"

                        c_data = {
                            "id": client_uuid,
                            "flow": flow_val,
                            "email": client_email,
                            "limitIp": 0,
                            "totalGB": total_bytes,
                            "expiryTime": 0,
                            "enable": True,
                            "subId": sub_id
                        }
                    elif protocol == "vmess":
                        c_data = {
                            "id": client_uuid,
                            "alterId": 0,
                            "email": client_email,
                            "limitIp": 0,
                            "totalGB": total_bytes,
                            "expiryTime": 0,
                            "enable": True,
                            "subId": sub_id
                        }
                    elif protocol in ["hysteria", "hysteria2", "hy2", "tuic"]:
                        c_data = {
                            "auth": client_uuid,
                            "password": client_uuid,
                            "id": client_uuid,
                            "email": client_email,
                            "limitIp": 0,
                            "totalGB": total_bytes,
                            "expiryTime": 0,
                            "enable": True,
                            "subId": sub_id
                        }
                    elif protocol in ["trojan", "shadowsocks", "ss"]:
                        c_data = {
                            "password": client_uuid,
                            "email": client_email,
                            "limitIp": 0,
                            "totalGB": total_bytes,
                            "expiryTime": 0,
                            "enable": True,
                            "subId": sub_id
                        }
                    else:
                        c_data = {
                            "id": client_uuid,
                            "password": client_uuid,
                            "email": client_email,
                            "limitIp": 0,
                            "totalGB": total_bytes,
                            "expiryTime": 0,
                            "enable": True,
                            "subId": sub_id
                        }
                    
                    new_inbound_clients.append(c_data)
                    
                    access_url = generate_inbound_access_url(
                        full_inb, server, client, client_uuid, sub_id, ext_host, ext_port
                    )
                    
                    key_id = str(uuid.uuid4())
                    client_keys_to_save.append(ClientKey(
                        id=key_id,
                        client_id=client.id,
                        server_id=server.id,
                        outline_key_id=f"{sub_id}:{ib_id_int}",
                        access_url=access_url or "",
                        created_at=now,
                        uuid=client_uuid,
                        last_seen_bytes=0
                    ))
                
                # Clean up existing clients and merge with new clients
                managed_emails = {f"{c.name}_{ib_id_int}" for c in clients} | {c.name for c in clients}
                retained_clients = [
                    cl for cl in existing_clients
                    if cl.get("email") not in managed_emails
                ]
                inb_settings["clients"] = retained_clients + new_inbound_clients
                full_inb["settings"] = json.dumps(inb_settings)
                
                # Apply update to 3X-UI in one single request
                updated = False
                for upd_ep in [f"panel/api/inbounds/update/{ib_id_int}", f"panel/inbound/update/{ib_id_int}"]:
                    try:
                        json_headers = dict(headers)
                        json_headers["Content-Type"] = "application/json"
                        async with session.post(build_url(api_base, upd_ep), json=full_inb, headers=json_headers, timeout=fast_timeout, ssl=ssl_verify) as u_resp:
                            if u_resp.status == 200:
                                uj = await u_resp.json()
                                if uj.get("success"):
                                    updated = True
                                    logger.info(f"3x-ui: Updated inbound {ib_id_int} with {len(new_inbound_clients)} client(s) on {server.name}")
                                    break
                    except Exception as upd_err:
                        logger.debug(f"3x-ui update inbound {ib_id_int} error: {upd_err}")
                
                # Save keys
                for k in client_keys_to_save:
                    # Remove any existing key for same client and server/inbound
                    existing_k = db.query(ClientKey).filter(
                        ClientKey.client_id == k.client_id,
                        ClientKey.server_id == k.server_id,
                        ClientKey.outline_key_id == k.outline_key_id
                    ).first()
                    if existing_k:
                        db.delete(existing_k)
                    db.add(k)
                    created_count += 1
            
            db.commit()
            return {
                "ok": True,
                "created_keys": created_count,
                "total_clients": len(clients),
                "failed_clients": []
            }
            
    except Exception as e:
        logger.exception(f"3x-ui batch sync error for {server.name}: {e}")
        return {
            "ok": False,
            "created_keys": created_count,
            "failed_clients": [c.name for c in clients],
            "error": str(e)
        }



