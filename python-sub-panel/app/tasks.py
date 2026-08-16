from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.database import SessionLocal
from app.models import Setting
import asyncio

scheduler = AsyncIOScheduler()

async def sync_usage_job():
    db = SessionLocal()
    try:
        from app.services.vpn_manager import sync_all_usage
        await sync_all_usage(db)
    except Exception as e:
        print(f"Sync usage error: {e}")
    finally:
        db.close()

async def check_expiry_job():
    db = SessionLocal()
    try:
        from app.services.vpn_manager import check_all_expiry
        await check_all_expiry(db)
    except Exception as e:
        print(f"Check expiry error: {e}")
    finally:
        db.close()

async def auto_backup_job():
    db = SessionLocal()
    try:
        auto_backup = db.query(Setting).filter(Setting.key == "auto_backup_enabled").first()
        if not auto_backup or auto_backup.value != "true":
            return
        
        webdav_url = db.query(Setting).filter(Setting.key == "webdav_url").first()
        webdav_username = db.query(Setting).filter(Setting.key == "webdav_username").first()
        webdav_password = db.query(Setting).filter(Setting.key == "webdav_password").first()
        
        if not all([webdav_url, webdav_username, webdav_password]):
            return
        
        from app.routers.backup import export_backup
        import aiohttp
        import json
        from datetime import datetime
        
        backup_data = await export_backup(db)
        filename = f"outline_panel_backup_{datetime.utcnow().strftime('%Y-%m-%d_%H%M%S')}.json"
        url = webdav_url.value.rstrip("/") + "/" + filename
        
        async with aiohttp.ClientSession() as session:
            async with session.put(
                url,
                data=json.dumps(backup_data).encode(),
                headers={"Content-Type": "application/json"},
                auth=aiohttp.BasicAuth(webdav_username.value, webdav_password.value),
                timeout=aiohttp.ClientTimeout(total=30),
                ssl=False
            ) as resp:
                if resp.status in [200, 201, 204]:
                    print(f"Auto backup completed: {filename}")
                else:
                    print(f"Auto backup failed: {resp.status}")
    except Exception as e:
        print(f"Auto backup error: {e}")
    finally:
        db.close()

async def auto_heal_missing_keys_job():
    """Background self-healing job that periodically checks active clients for missing server keys and generates them."""
    db = SessionLocal()
    try:
        from app.models import Client, Server, ClientKey
        from app.services.vpn_manager import generate_keys_for_client
        
        all_servers = db.query(Server).all()
        if not all_servers:
            return
            
        active_clients = db.query(Client).filter(Client.status == "active").all()
        synced_total = 0
        
        for client in active_clients:
            existing_key_server_ids = {k.server_id for k in db.query(ClientKey).filter(ClientKey.client_id == client.id).all()}
            missing_server_ids = [s.id for s in all_servers if s.id not in existing_key_server_ids]
            
            if missing_server_ids:
                try:
                    await generate_keys_for_client(client, missing_server_ids, db)
                    synced_total += len(missing_server_ids)
                except Exception as e:
                    print(f"Auto-heal error generating keys for {client.name}: {e}")
                    
        if synced_total > 0:
            print(f"[Auto-Heal Cron] Successfully auto-generated {synced_total} missing keys for active clients.")
    except Exception as e:
        print(f"Auto-heal missing keys job error: {e}")
    finally:
        db.close()

def start_scheduler(interval_minutes: int = 10):
    scheduler.add_job(sync_usage_job, 'interval', minutes=interval_minutes, id="sync_usage")
    scheduler.add_job(check_expiry_job, 'interval', hours=24, id="check_expiry")
    scheduler.add_job(auto_backup_job, 'cron', hour=3, minute=0, id="auto_backup")
    scheduler.add_job(auto_heal_missing_keys_job, 'interval', minutes=30, id="auto_heal_missing_keys")
    scheduler.start()
    print(f"Scheduler started: sync every {interval_minutes}min, expiry check daily, backup at 3AM, auto-heal missing keys every 30min")
