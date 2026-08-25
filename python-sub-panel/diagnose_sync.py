import asyncio
from app.database import SessionLocal
from app.models import Client, ClientKey, Server
from app.services.three_xui import login_3xui, build_url, get_ssl_setting, DEFAULT_TIMEOUT
from app.services.vpn_manager import fetch_3xui_metrics
import aiohttp
import sys

async def diagnose():
    db = SessionLocal()
    try:
        client = db.query(Client).filter(Client.name == "me").first()
        if not client:
            print("Client 'me' not found in database.")
            return
            
        print(f"=== DIAGNOSIS FOR CLIENT: {client.name} ===")
        print(f"Database total_usage_bytes: {client.total_usage_bytes} ({client.total_usage_bytes / (1024**3):.4f} GB)")
        
        servers = {s.id: s for s in db.query(Server).all()}
        keys = db.query(ClientKey).filter(ClientKey.client_id == client.id).all()
        
        print(f"\nClient Keys in DB ({len(keys)}):")
        for k in keys:
            server = servers.get(k.server_id)
            server_name = server.name if server else "Unknown"
            print(f"  - Key ID: {k.id}")
            print(f"    Server: {server_name} ({k.server_id})")
            print(f"    Outline Key ID: {k.outline_key_id}")
            print(f"    UUID: {k.uuid}")
            print(f"    Last Seen Bytes in DB: {k.last_seen_bytes} ({k.last_seen_bytes / (1024**3):.4f} GB)")

        print("\nFetching current live metrics from servers...")
        server_metrics = {}
        for server_id, server in servers.items():
            try:
                if server.type == "3x-ui":
                    metrics = await fetch_3xui_metrics(server, keys)
                    server_metrics[server_id] = metrics
                    print(f"  - {server.name} (3x-ui) returned {len(metrics)} keys: {list(metrics.keys())}")
                elif server.type == "outline":
                    from app.services import outline
                    metrics = await outline.fetch_metrics(server)
                    server_metrics[server_id] = metrics
                    print(f"  - {server.name} (Outline) returned {len(metrics)} keys: {list(metrics.keys())}")
                elif server.type in ["hysteria2", "hysteria2_python"]:
                    from app.services import hysteria2
                    metrics = await hysteria2.fetch_hysteria2_metrics(server)
                    server_metrics[server_id] = metrics
                    print(f"  - {server.name} (Hysteria2) returned {len(metrics)} keys: {list(metrics.keys())}")
            except Exception as e:
                print(f"  - Failed to fetch from {server.name}: {e}")
                
        print("\n=== SIMULATING sync_all_usage STEP-BY-STEP ===")
        client_delta = 0
        for k in keys:
            server = servers.get(k.server_id)
            metrics = server_metrics.get(k.server_id, {})
            user_metric = None
            matched_by = "none"
            
            if server and server.type == "3x-ui":
                if k.outline_key_id and k.outline_key_id in metrics:
                    user_metric = metrics.get(k.outline_key_id)
                    matched_by = f"outline_key_id ({k.outline_key_id})"
                elif k.uuid and k.outline_key_id and ":" in k.outline_key_id:
                    inbound_id_part = k.outline_key_id.split(':')[-1]
                    uuid_inbound_key = f"{k.uuid}:{inbound_id_part}"
                    if uuid_inbound_key in metrics:
                        user_metric = metrics.get(uuid_inbound_key)
                        matched_by = f"uuid_inbound_key ({uuid_inbound_key})"
                elif k.uuid and k.uuid in metrics and ":" not in (k.outline_key_id or ""):
                    user_metric = metrics.get(k.uuid)
                    matched_by = f"uuid ({k.uuid})"
            
            current_bytes = int(user_metric or 0)
            
            # Print mapping and current bytes
            print(f"\nKey ID: {k.id} ({k.outline_key_id})")
            print(f"  Matched by: {matched_by}")
            print(f"  Live bytes on server: {current_bytes} ({current_bytes / (1024**3):.4f} GB)")
            print(f"  Last seen bytes (DB): {k.last_seen_bytes} ({k.last_seen_bytes / (1024**3):.4f} GB)")
            
            # Baseline & delta calculations
            if k.last_seen_bytes is None or k.last_seen_bytes <= 0:
                calc_last_seen = current_bytes
                delta = 0
                branch = "Baseline run (last_seen_bytes <= 0)"
            elif current_bytes < k.last_seen_bytes:
                delta = current_bytes
                calc_last_seen = current_bytes
                branch = f"Counter reset on remote server (current_bytes {current_bytes} < last_seen_bytes {k.last_seen_bytes})"
            else:
                delta = current_bytes - k.last_seen_bytes
                calc_last_seen = current_bytes
                branch = f"Normal increment (current_bytes {current_bytes} - last_seen_bytes {k.last_seen_bytes})"
                
            print(f"  Evaluated branch: {branch}")
            print(f"  Calculated delta: {delta} ({delta / (1024**3):.4f} GB)")
            print(f"  New last_seen_bytes to save: {calc_last_seen}")
            client_delta += delta
            
        print(f"\n=== FINAL SIMULATION RESULT ===")
        print(f"Accumulated client_delta: {client_delta} ({client_delta / (1024**3):.4f} GB)")
        print(f"New client.total_usage_bytes would be: {client.total_usage_bytes + client_delta} ({(client.total_usage_bytes + client_delta) / (1024**3):.4f} GB)")
        
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(diagnose())
