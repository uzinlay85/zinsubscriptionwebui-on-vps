# Unified VPN Subscription Panel (FastAPI + SQLite)

A lightweight, self-contained VPN subscription management panel running entirely on your VPS using **FastAPI** and **SQLite**. Manage **Outline**, **Hysteria2**, and **3x-ui** (Xray/V2ray) servers from one interface, and issue a single universal subscription link for your users.

---

## 🌟 Key Features

* **Multi-Protocol Support**: Manage **Outline**, **Hysteria2**, and **3x-ui** servers from one interface.
* **Universal Subscription Links**: Serve Clash, Sing-box JSON, or Base64 (V2ray/Shadowsocks) formats automatically based on the user-agent via `/api/sub/[token]`.
* **Zero-Downtime Subscription Resilience**:
  * If a connected node is down or timing out (e.g., 3x-ui server offline), the panel uses a `5s timeout` to skip the offline server and keep the subscription active for the rest of the nodes.
  * Expired/Suspended accounts receive a fallback dummy proxy node displaying status (e.g., `🚫 Account Suspended` or `❌ Subscription Expired`) alongside HTTP 200 OK headers. This ensures client apps do not delete the subscription link.
* **Production-Grade Security**:
  * **Path-based secret gate** (`ADMIN_SECRET_PATH`) before login page.
  * **HTTP-only, SameSite=Strict session cookies** for admin auth.
  * **Timing-safe credential comparison** to prevent timing attacks.
  * **Bearer token authentication** for all cron endpoints.
* **Built-in Background Tasks (APScheduler)**: No external crontab required. Usage sync, expiry checks, and auto-backups run automatically inside the container.
* **Live Data Usage Tracking**: Real-time byte usage polling with a centralized metrics engine to deduplicate API requests.
* **Smart Key Synchronization**: One-click key deployment to push keys to any newly added servers.
* **WebDAV Cloud Backups**: Nightly automated JSON database backups to WebDAV services (like Koofr or Nextcloud).

---

### 🏗️ Architecture & How It Works

```
  ┌──────────────────┐
  │   User App       │
  │ (Shadowrocket /  │
  │  Clash / v2ray)  │
  └────────┬─────────┘
           │ Request subscription (/api/sub/[token])
           ▼
  ┌──────────────────┐
  │  Nginx / Domain  │
  │  (HTTPS 443)     │
  └────────┬─────────┘
           │ Proxy
           ▼
  ┌──────────────────┐
  │  FastAPI Panel   │
  │  (Port 8000)     │
  └────────┬─────────┘
           │
           ├─► [Fetch Outline / Hysteria2 / 3x-ui Metrics]
           │   (5-second timeout per server)
           │
           └─► [Compile access keys to subscription]
                └─► SQLite Database (/data/panel.db)
```

---

## 🚀 One-Click Setup

For the fastest deployment, use our automated setup script. This will install Docker, clone the repository, generate secure credentials, and start the application automatically.

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/uzinlay85/zinsubscriptionwebui-on-vps/main/python-sub-panel/setup.sh -o setup.sh
bash setup.sh
```

The script will:
1. ✅ Install Docker & Docker Compose (if not present)
2. ✅ Clone the repository to `/opt/vpn-sub-panel`
3. ✅ Generate secure random passwords and secrets
4. ✅ Create `.env` configuration file
5. ✅ Start the application with Docker Compose
6. ✅ Configure firewall rules
7. ✅ Optionally setup domain with HTTPS (Nginx + Certbot)

**After setup completes**, open your browser and visit:
```
http://your-vps-ip:8000/<generated-secret-path>
```
or if you configured a domain during setup:
```
https://your-domain.com/<generated-secret-path>
```

You can also setup a domain later by running:
```bash
cd /opt/vpn-sub-panel/python-sub-panel
bash setup-domain.sh
```

---

## 📋 Prerequisites

1. **VPS** with Ubuntu/Debian (root access)
2. **VPN Servers**:
   * **Outline**: API URL and Cert SHA-256 (obtained via `cat /opt/outline/access.txt` on your VPS).
   * **Hysteria2**: Express Admin API running on the VPS.
   * **3x-ui**: An active 3x-ui panel (v3.0+ with CSRF token support).
3. **Domain** (optional): For HTTPS access.

---

## 🖥️ How to Add a Server (Where to Find Each Field)

Click **Add Server** in the Servers page. The required fields differ by server type.

---

### 🔵 Outline Server

| Field | Where to Find It |
|---|---|
| **Server Name** | Any display name you choose (e.g. `SG-01 Outline`) |
| **Outline API URL** | SSH into your VPS and run: `cat /opt/outline/access.txt` → copy the `apiUrl` value |
| **Certificate SHA-256** | From the same `access.txt` output → copy the `certSha256` value |

**Example `access.txt` output:**
```json
{"apiUrl":"https://123.45.67.89:12345/AbCdEfGhIjKlMn","certSha256":"AB:CD:EF:12:34:56:..."}
```
Copy `apiUrl` → paste into **Outline API URL**.
Copy `certSha256` → paste into **Certificate SHA-256**.

---

### 🟣 Hysteria2 Server

> Requires the [Hysteria2 Express Backend](https://github.com/sin-ack/hysteria2-express-backend) running on your VPS.

| Field | Where to Find It |
|---|---|
| **Server Name** | Any display name you choose (e.g. `US-01 Hysteria`) |
| **Server API URL** | The URL to your Hysteria2 Express Backend admin API — e.g. `https://your-domain.com/admin_path` or `http://123.45.67.89:8080` |
| **Auth Username** | The admin username you set when configuring the Hysteria2 Express Backend |
| **Auth Password** | The admin password you set when configuring the Hysteria2 Express Backend |

---

### 🟢 3x-ui Server

| Field | Where to Find It |
|---|---|
| **Server Name** | Any display name you choose (e.g. `DE-01 3x-ui`) |
| **3x-ui Panel URL** | The full URL of your 3x-ui panel including port — e.g. `http://123.45.67.89:2053` or `https://panel.yourdomain.com` |
| **Panel Username** | Your 3x-ui admin username (default: `admin`) |
| **Panel Password** | Your 3x-ui admin password |
| **Inbound ID** | Go to your 3x-ui panel → **Inbounds** list → look at the **#** column (the number on the left of the inbound row) |
| **External Domain** *(optional)* | If your inbound uses a CDN or reverse proxy domain (e.g. `sg.yourdomain.com`) — leave blank if using direct IP |
| **External Port** *(optional)* | If your inbound is behind a reverse proxy on a different port (e.g. `443`) — leave blank to use the inbound's own port |

**How to find Inbound ID in 3x-ui:**
```
3x-ui Panel → Inbounds (ဝင်ချောင်းများ) → table ထဲရှိ # ကော်လံ၏ ဂဏန်း
e.g.  # | Protocol | ...
      1 | vmess    | ...   ← Inbound ID = 1
      2 | vless    | ...   ← Inbound ID = 2
```

---

## ⚙️ Manual Deployment (If Not Using setup.sh)

### Option A: Docker Compose (Recommended)

```bash
# 1. SSH into your VPS
ssh root@your-vps-ip

# 2. Clone the repository
git clone https://github.com/uzinlay85/zinsubscriptionwebui-on-vps.git /opt/vpn-sub-panel
cd /opt/vpn-sub-panel/python-sub-panel

# 3. Copy environment file and edit
cp .env.example .env
nano .env

# 4. Start with Docker Compose
docker compose up -d --build

# 5. Check logs
docker compose logs -f

# 6. Access admin panel
# Browser: http://<your-vps-ip>:8000/<ADMIN_SECRET_PATH>
```

### Option B: Direct Python / venv (No Docker Required)

Use this if your VPS does not have Docker installed.

```bash
# 1. SSH into your VPS
ssh root@your-vps-ip

# 2. Clone the repository
git clone https://github.com/uzinlay85/zinsubscriptionwebui-on-vps.git /opt/vpn-sub-panel
cd /opt/vpn-sub-panel/python-sub-panel

# 3. Install system dependencies
apt update
apt install -y python3-venv python3-pip python3-dev build-essential libssl-dev libffi-dev

# 4. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# 5. Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 6. Copy environment file and edit
cp .env.example .env
nano .env

# 7. Run the application
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 8. Verify it's running
curl http://localhost:8000/health
```

**Note:** When running without Docker, background tasks (APScheduler) still run automatically inside the uvicorn process. No external crontab is required.

---

### Production: systemd Service (No Docker)

To run the panel as a background service that starts on boot:

```bash
# 1. Create systemd service file
nano /etc/systemd/system/vpn-panel.service
```

Paste the following (replace `/opt/vpn-sub-panel` with your actual path):

```ini
[Unit]
Description=Unified VPN Subscription Panel (FastAPI)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vpn-sub-panel/python-sub-panel
Environment="PATH=/opt/vpn-sub-panel/python-sub-panel/venv/bin"
ExecStart=/opt/vpn-sub-panel/python-sub-panel/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# 2. Reload systemd and enable the service
systemctl daemon-reload
systemctl enable vpn-panel
systemctl start vpn-panel

# 3. Check status
systemctl status vpn-panel

# 4. View logs
journalctl -u vpn-panel -f
```

---

## 🌐 Domain Setup with Nginx + SSL

### 1. Point Domain to Your VPS

Go to your domain registrar or DNS provider and add an **A record**:

| Type | Name / Root | Value / IP | TTL |
|---|---|---|---|
| A | `@` | `<your-vps-ip>` | 3600 |
| A | `www` | `<your-vps-ip>` | 3600 |

Verify DNS propagation:

```bash
dig vpn.example.com
# or
nslookup vpn.example.com
```

### 2. Allow HTTP/HTTPS Through Firewall

```bash
# If using ufw
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload

# If using firewalld
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

### 3. Install Nginx

```bash
apt update
apt install -y nginx
```

### 4. Create Nginx Config

```bash
nano /etc/nginx/sites-available/vpn-panel
```

Paste the following (replace `vpn.example.com` with your actual domain):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name vpn.example.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
        proxy_buffering off;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        access_log off;
    }
}
```

### 5. Enable the Site

```bash
# Create symlink
ln -s /etc/nginx/sites-available/vpn-panel /etc/nginx/sites-enabled/

# Remove default site if exists
rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
nginx -t

# Reload Nginx
systemctl reload nginx
```

### 6. Obtain SSL Certificate with Certbot

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get certificate
certbot --nginx -d vpn.example.com

# Follow the prompts:
# 1. Enter your email
# 2. Agree to Terms of Service
# 3. Choose whether to redirect HTTP to HTTPS (recommended: Yes)
```

Certbot will automatically:
- Obtain the SSL certificate
- Update your Nginx config with SSL paths
- Set up auto-renewal

### 7. Test Auto-Renewal

```bash
# Dry run
certbot renew --dry-run

# Check renewal timer
systemctl status certbot.timer
```

---

## ✅ Post-Setup Verification Checklist

After running `setup.sh`, verify your installation with these checks:

```bash
# 1. Check container is running
cd /opt/vpn-sub-panel/python-sub-panel
docker compose ps

# 2. Check application health
curl -s http://localhost:8000/health
# Expected: {"status":"ok","timestamp":"..."}

# 3. Check Nginx is running
systemctl status nginx

# 4. Check SSL certificate (if domain setup was chosen)
certbot certificates

# 5. Test login API
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'
```

**Common Issues & Solutions:**

| Issue | Solution |
|---|---|
| `ERR_TOO_MANY_REDIRECTS` | Clear browser cookies, ensure `ADMIN_SECRET_PATH` is correct in `.env` |
| `502 Bad Gateway` | App not running: `docker compose logs -f` |
| `Connection refused` | Firewall: `ufw allow 8000/tcp` |
| `SSL certificate error` | Run `certbot renew` |
| `Page not found` | Ensure you're visiting `https://domain.com/<ADMIN_SECRET_PATH>` |
| `Login button not working` | Check browser console for errors, ensure Tailwind CSS CDN is loading |
| `Sync usage error` | Normal if no servers are configured yet |

---

## 🔧 Useful Commands

```bash
# View logs
cd /opt/vpn-sub-panel/python-sub-panel
docker compose logs -f

# Restart application
docker compose restart

# Stop application
docker compose down

# Start application
docker compose up -d --build

# Check container status
docker compose ps

# Update application
cd /opt/vpn-sub-panel
git pull origin main
cd python-sub-panel
docker compose build --pull
docker compose up -d
```

---

## 🗑️ Uninstall

To completely remove the panel from your VPS:

```bash
cd /opt/vpn-sub-panel/python-sub-panel
bash uninstall.sh
```

The uninstall script will:
1. 🛑 Stop and remove Docker containers
2. 🛑 Stop and remove systemd service (if present)
3. 🛑 Kill uvicorn processes
4. 🗑️ Remove Nginx configuration and SSL certificates
5. 🗑️ Delete installation directory (optional)
6. 🗑️ Remove Docker (optional)

---

## 📁 Project Structure

```
python-sub-panel/
├── app/
│   ├── __init__.py
│   ├── database.py       # SQLAlchemy + SQLite setup
│   ├── models.py         # Server, Client, ClientKey, Setting tables
│   ├── schemas.py        # Pydantic request/response models
│   ├── main.py           # FastAPI entry point + auth middleware
│   ├── tasks.py          # APScheduler background jobs
│   ├── routers/
│   │   ├── auth.py       # Login/logout with timing-safe comparison
│   │   ├── clients.py    # Client CRUD + usage metrics fetch
│   │   ├── servers.py    # Server CRUD + status ping + orphan keys
│   │   ├── settings.py   # App settings management
│   │   ├── backup.py     # JSON export/import + WebDAV backup
│   │   ├── sub.py        # Universal subscription link generator
│   │   └── cron.py       # Cron endpoints (Bearer token auth)
│   ├── services/
│   │   ├── outline.py    # Outline VPN API integration
│   │   ├── hysteria2.py  # Hysteria2 Express + Flask panel integration
│   │   └── vpn_manager.py # Multi-protocol orchestrator
│   ├── templates/
│   │   ├── login.html    # Admin login page
│   │   └── dashboard.html # Admin dashboard
│   └── static/
│       └── styles.css    # Glassmorphic dark theme CSS
├── data/                 # SQLite DB storage (mounted volume)
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── setup.sh              # One-click automated setup script
├── setup-domain.sh       # Domain + SSL setup script
├── uninstall.sh          # Clean uninstall script
└── README.md
```

---

## 🔒 Security Features

* **Path-based secret gate** (`ADMIN_SECRET_PATH`) before login page
* **HTTP-only, SameSite=Strict session cookies**
* **Timing-safe credential comparison** to prevent timing attacks
* **Bearer token authentication** for all cron endpoints
* **5-second connection timeouts** on all external API requests
* **No sensitive data exposure** in logs or error messages

---

## 📊 Tech Stack

| Feature | Details |
|---|---|
| **Runtime** | Python 3.11+ |
| **Framework** | FastAPI (ASGI) |
| **Database** | SQLite (file-based, zero-config) |
| **Hosting** | Single VPS (Docker or Direct) |
| **RAM Usage** | ~30-50MB in production |
| **External Dependencies** | None (no Supabase, no Vercel) |
| **Background Tasks** | Built-in APScheduler |
| **UI** | Jinja2 templates + Tailwind CSS |

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## 📄 License

This project is licensed under the MIT License.
