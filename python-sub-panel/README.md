# Unified VPN Subscription Panel (FastAPI + SQLite)

A lightweight, self-contained VPN subscription management panel running entirely on your VPS using FastAPI and SQLite.

## Features

- **Multi-Protocol Support**: Manage Outline, Hysteria2, and 3x-ui servers
- **Universal Subscription Links**: Support for Clash, Sing-box, and Base64 formats
- **Zero-Downtime Resilience**: 5-second timeouts with fallback dummy nodes
- **Background Tasks**: Built-in APScheduler for usage sync and expiry checks
- **WebDAV Backups**: Cloud backup support
- **Fully Self-Contained**: No external dependencies beyond Python

## Quick Start

```bash
# Clone or copy the project to your VPS
cd /home/ubuntu/python-sub-panel

# Start with Docker Compose
docker compose up -d --build

# Access admin panel
# Browser: http://<your-vps-ip>:8000/admin
# Or: http://<your-vps-ip>:8000/<ADMIN_SECRET_PATH>
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ADMIN_USERNAME` | `admin` | Admin login username |
| `ADMIN_PASSWORD` | `securepassword123` | Admin login password |
| `AUTH_SECRET` | `change_me` | Session cookie secret |
| `CRON_SECRET` | `my-super-secret-cron-2026` | Cron job auth token |
| `ADMIN_SECRET_PATH` | `daweitharlay` | Hidden path for admin access |
| `APP_NAME` | `My VPN Panel` | Brand name in subscription links |
| `PANEL_NAME` | `VPN Panel` | Panel display name |
| `SYNC_INTERVAL_MINUTES` | `10` | Usage sync interval |

## Project Structure

```
python-sub-panel/
├── app/
│   ├── __init__.py
│   ├── database.py       # SQLite + SQLAlchemy setup
│   ├── models.py         # DB models
│   ├── schemas.py        # Pydantic schemas
│   ├── main.py           # FastAPI app entry point
│   ├── routers/          # API route handlers
│   ├── services/         # VPN integrations (Outline, Hysteria2, 3x-ui)
│   ├── templates/        # Admin dashboard HTML
│   └── static/           # CSS styles
├── data/                 # SQLite database storage
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

## API Endpoints

- `GET /` - Admin dashboard
- `GET /login` - Login page
- `POST /api/auth/login` - Admin login
- `POST /api/auth/logout` - Admin logout
- `GET /api/sub/{token}` - Subscription link (public)
- `GET /api/cron/sync-usage` - Sync usage stats
- `GET /api/cron/check-expiry` - Check expired clients
- `GET /api/cron/auto-backup` - Automated backup
- `GET /api/clients` - List clients
- `POST /api/clients` - Create client
- `PUT /api/clients/{id}` - Update client
- `DELETE /api/clients/{id}` - Delete client
- `GET /api/servers` - List servers
- `POST /api/servers` - Add server
- `PUT /api/servers/{id}` - Update server
- `DELETE /api/servers/{id}` - Delete server
- `GET /api/settings` - Get settings
- `POST /api/settings` - Update settings
- `GET /api/backup/export` - Export backup
- `POST /api/backup/import` - Import backup
