# Unified VPN Subscription Panel

A modern, feature-rich unified web panel to manage **Outline**, **Hysteria2**, and **3x-ui** (Xray/V2ray) VPN servers. Issue a single universal subscription link for your users, and control their access, expiry, and track live data usage across multiple servers from a single dashboard.

မြန်မာဘာသာဖြင့် ဖတ်ရှုရန် အောက်သို့ ဆင်းပါ။

---

## 🇺🇸 English Documentation

### 🌟 Key Features & Improvements

* **Multi-Protocol Support**: Manage **Outline**, **Hysteria2**, and **3x-ui** servers from one interface.
* **Universal Subscription Links**: Serve Clash, Sing-box JSON, or Base64 (V2ray/Shadowsocks) formats automatically based on the user-agent via `/api/sub/[token]`.
* **Zero-Downtime Subscription Resilience**: 
  * If a connected node is down or timing out (e.g., 3x-ui server offline), the panel uses a `5s timeout` to skip the offline server and keep the subscription active for the rest of the nodes.
  * Expired/Suspended accounts receive a fallback dummy proxy node displaying status (e.g., `🚫 Account Suspended` or `❌ Subscription Expired`) alongside HTTP 200 OK headers. This ensures client apps do not delete the subscription link.
* **Production-Grade Security (RLS + Service Role Key)**: 
  * **Row Level Security (RLS)** is enabled on all Supabase tables (`clients`, `servers`, `client_keys`, `settings`) to block public data access.
  * The backend utilizes `SUPABASE_SERVICE_ROLE_KEY` internally to bypass RLS securely for server-side operations, making it invulnerable to client-side data scraping.
* **Robust Cron Authentication**: All cron endpoints require `Authorization: Bearer <CRON_SECRET>` headers to prevent unauthorized database querying or DDoS attacks.
* **VPS Crontab Integration**: Optimized for Vercel Free plan. Runs scheduled routines (usage sync, check expiry, auto backups) smoothly from any Linux VPS.
* **Live Data Usage Tracking**: Real-time byte usage polling (every 15s) with a centralized metrics engine to deduplicate Outline API requests.
* **Smart Key Synchronization**: One-click key deployment to push keys to any newly added servers.
* **WebDAV Cloud Backups**: Nightly automated JSON database backups to WebDAV services (like Koofr or Nextcloud).
* **Enhanced UI/UX**: Custom inline confirmation states replace intrusive browser alerts and confirm dialogues.

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
  │  Vercel Server   ├───────► [Read settings/client data] ─────┐
  │  (Next.js App)   │                                          │
  └────────┬─────────┘                                          ▼
           │                                            ┌──────────────┐
           ├─► [Fetch Outline / 3x-ui Metrics]          │   Supabase   │
           │   (5-second AbortSignal timeout)           │  (PostgreSQL │
           │                                            │  with RLS)   │
           └─► [Compile access keys to subscription]    └──────────────┘
                                                                ▲
                                                                │ Bypasses RLS safely via
                                                                │ Service Role Key
                                                                │
  ┌──────────────────┐      curl HTTP Bearer Request            │
  │   Linux VPS      ├──────────────────────────────────────────┘
  │ (System Cron)    │ (Updates usage every 10m, checks expiry,
  └──────────────────┘  performs WebDAV backups daily)
```

---

### ⚡ One-Click Setup (Python FastAPI Edition)

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
7. ✅ Display your admin URL and credentials

**After setup completes**, open your browser and visit:
```
http://your-vps-ip:8000/<generated-secret-path>
```

---

### 📋 Prerequisites

1. **Supabase Account**: For the PostgreSQL database.
2. **Vercel Account**: For free hosting of the Next.js panel.
3. **VPN Servers**:
   * **Outline**: API URL and Cert SHA-256 (obtained via `cat /opt/outline/access.txt` on your VPS).
   * **Hysteria2**: Express Admin API running on the VPS.
   * **3x-ui**: An active 3x-ui panel (v3.0+ with CSRF token support).

---

### 🚀 Step-by-Step Installation & Deployment

#### 1. Setup Supabase Database
Create a project on [Supabase](https://supabase.com). Open the **SQL Editor** and run this schema:

```sql
-- Create Servers Table
CREATE TABLE servers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  cert_sha256 TEXT NOT NULL,
  auth_username TEXT,
  auth_password TEXT,
  inbound_id INTEGER,
  type TEXT DEFAULT 'outline' NOT NULL,
  username TEXT,
  password TEXT,
  external_domain TEXT,
  external_port INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Clients Table
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sub_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL,
  expiry_date TIMESTAMP WITH TIME ZONE NULL,
  data_limit_gb INTEGER,
  total_usage_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Client Keys Table
CREATE TABLE client_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  outline_key_id TEXT NOT NULL,
  access_url TEXT NOT NULL,
  uuid TEXT,
  last_seen_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Settings Table
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

#### 2. Enable Row Level Security (RLS) on Supabase
Enable RLS on all 4 tables for maximum security. Under **Table Editor**, select each table (`clients`, `servers`, `client_keys`, `settings`) and toggle **RLS Enabled** to `true` (No custom policy is needed as the admin client bypasses RLS using the service role key).

#### 3. Deploy to Vercel
1. Import your GitHub repository to Vercel.
2. In the **Environment Variables** settings, add:
   * `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase Project URL.
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase public key.
   * `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase **`service_role`** secret key (Go to Supabase Dashboard > Project Settings > API > `service_role` key).
   * `ADMIN_USERNAME`: Username to login to this dashboard (e.g., `admin`)
   * `ADMIN_PASSWORD`: Password to login to this dashboard
   * `AUTH_SECRET`: A random long string for session encryption
   * `CRON_SECRET`: A long secure password for authorizing Cron Jobs (e.g., `my-super-secret-cron-2026`)
   * `ADMIN_SECRET_PATH`: A custom secret path gate (e.g., `daweitharlay`). You must visit `https://your-domain.com/your_secret_path` first to bypass the 404 block and access the login screen.
3. Deploy the application.

---

### ⚙️ Setting up Cron Jobs on a Linux VPS (Recommended)
Since Vercel's Free plan limits crons, hosting scheduled jobs on your main VPS is free, stable, and allows fast sync cycles.

1. SSH into your VPS.
2. Open the cron editor:
   ```bash
   crontab -e
   ```
3. Paste the following entries at the bottom of the file (replace `my-super-secret-cron-2026` with your Vercel `CRON_SECRET` value and update the domain):
   ```bash
   # 1. Sync usage stats every 10 minutes
   */10 * * * * curl -s -H "Authorization: Bearer my-super-secret-cron-2026" "https://your-app.vercel.app/api/cron/sync-usage" > /dev/null

   # 2. Check for expired clients once daily at midnight
   0 0 * * * curl -s -H "Authorization: Bearer my-super-secret-cron-2026" "https://your-app.vercel.app/api/cron/check-expiry" > /dev/null

   # 3. Perform automated database WebDAV backup daily at 3:00 AM
   0 3 * * * curl -s -H "Authorization: Bearer my-super-secret-cron-2026" "https://your-app.vercel.app/api/cron/auto-backup" > /dev/null
   ```
4. Save and exit (If using Nano, press `Ctrl+O`, `Enter`, then `Ctrl+X`).

---

### ☁️ Cloud Auto Backup Setup (WebDAV / Koofr)
1. Create a free account on [Koofr](https://koofr.eu).
2. Go to **Preferences > Password > App Passwords** and generate a password (e.g. named "VPN Panel").
3. In your panel's **Settings > Backup & Restore**:
   * **URL**: `https://app.koofr.net/dav/Koofr` (You can append `/FolderName` at the end to target a folder).
   * **Username**: Your Koofr account email.
   * **Password**: The **App Password** you generated.
4. Turn on **Enable Daily Auto Backup** and click **Save Settings**.

---

### 🖥️ How to Add a Server (Where to Find Each Field)

Click **Add Server** in the Servers page. The required fields differ by server type.

---

#### 🔵 Outline Server

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

#### 🟣 Hysteria2 Server

> Requires the [Hysteria2 Express Backend](https://github.com/sin-ack/hysteria2-express-backend) running on your VPS.

| Field | Where to Find It |
|---|---|
| **Server Name** | Any display name you choose (e.g. `US-01 Hysteria`) |
| **Server API URL** | The URL to your Hysteria2 Express Backend admin API — e.g. `https://your-domain.com/admin_path` or `http://123.45.67.89:8080` |
| **Auth Username** | The admin username you set when configuring the Hysteria2 Express Backend |
| **Auth Password** | The admin password you set when configuring the Hysteria2 Express Backend |

---

#### 🟢 3x-ui Server

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

### 🐍 Python FastAPI Edition (VPS-Only, Zero External Dependencies)

ပရောဂျက်ရဲ့ **အမြန်ဆန်းခြံ့ပြီး VPS တစ်လုံးတည်းပေါ်မှာ အသုံးပြုနိုင်မည့် Python FastAPI ဗားရှင်း** ကို အောက်ပါအတိုင်း တည်ဆောက်ထားပါသည်။ Next.js + Supabase အစား **FastAPI + SQLite** ကို အသုံးပြုထားပြီး၊ VPS တစ်လုံးတည်းပေါ်မှာ လုံးဝလွတ်လပ်စွာ အလုပ်လုပ်နိုင်ပါတယ်။

#### အဓိက အကျိုးကျေးဇူးများ

1. **RAM အသုံးပြုမှု အလွန်နည်းခြင်း**: FastAPI (Python ASGI) ဖြင့် Production တွင် RAM 30MB - 50MB ဝန်းကျင်သာ စားသုံးမည်ဖြစ်ပြီး 512MB RAM ရှိသော VPS သေးသေးလေးပေါ်မှာပင် အလွန်မြန်ဆန်စွာ အလုပ်လုပ်နိုင်ပါသည်။
2. **SQLite ဒေတာဘေ့စ် (Zero-Config Database)**: Supabase သို့မဟုတ် သီးခြား PostgreSQL container ထပ်လိုတော့ဘဲ `/data/panel.db` ဖိုင်တစ်ခုတည်းဖြင့် ဒေတာအားလုံးကို အလွယ်တကူ သိမ်းဆည်းပေးပါသည်။ Backup လုပ်ရန်လည်း ထိုဖိုင်တစ်ခုတည်းကို ကူးယူရန် လုံလောက်ပါသည်။
3. **Built-in Background Tasks (APScheduler)**: VPS ၏ system crontab ကို သီးခြားခွဲစရာမလိုဘဲ အပလီကေးရှင်းအတွင်းမှာပင် Usage sync လုပ်ခြင်းနှင့် Expiry စစ်ဆေးခြင်းတို့ကို Background မှ အလိုအလျောက် လုပ်ဆောင်ပေးပါသည်။
4. **Universal Subscription Links & Fallback**: အသုံးပြုသူများအတွက် Sub Link တစ်ခုတည်းဖြင့် Outline နှင့် အခြားဆာဗာများ၏ Key များကို User-Agent အလိုက် အလိုအလျောက် ထုတ်ပေးသည်။ အကောင့်သက်တမ်းကုန် သို့မဟုတ် ပိတ်ထားသူများအတွက် HTTP 200 OK နှင့်အတူ Fallback Dummy Proxy Node ကို ပြသပေးသောကြောင့် Client App များတွင် Link ပျက်ခြင်း မရှိပါ။

#### 📁 Project Structure (Python Edition)

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
└── README.md
```

#### ⚡ Quick Start with Setup Script

The fastest way to deploy is using the automated setup script:

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Download and run setup
curl -fsSL https://raw.githubusercontent.com/uzinlay85/zinsubscriptionwebui-on-vps/main/python-sub-panel/setup.sh -o setup.sh
bash setup.sh
```

The script will guide you through:
- Installing Docker automatically
- Cloning the repository
- Generating secure credentials
- Creating `.env` configuration
- Starting the application
- Configuring firewall

**Optional: Add Domain + SSL**

After the initial setup, run the domain setup script:

```bash
cd /opt/vpn-sub-panel/python-sub-panel
bash setup-domain.sh
```

This will configure Nginx, obtain SSL certificate from Let's Encrypt, and restart the application.

---

#### ⚙️ Manual VPS Deployment (Python Edition)

There are **two deployment options** for the Python edition.

##### Option A: Docker Compose (Recommended)

```bash
# 1. SSH into your VPS
ssh root@your-vps-ip

# 2. Clone or update the project
git clone https://github.com/uzinlay85/zinsubscriptionwebui-on-vps.git
cd zinsubscriptionwebui-on-vps/python-sub-panel

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

##### Option B: Direct Python / venv (No Docker Required)

Use this if your VPS does not have Docker installed.

```bash
# 1. SSH into your VPS
ssh root@your-vps-ip

# 2. Clone or update the project
git clone https://github.com/uzinlay85/zinsubscriptionwebui-on-vps.git
cd zinsubscriptionwebui-on-vps/python-sub-panel

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

##### Production: systemd Service (No Docker)

To run the panel as a background service that starts on boot:

```bash
# 1. Create systemd service file
nano /etc/systemd/system/vpn-panel.service
```

Paste the following (replace `/home/zinko` with your actual path):

```ini
[Unit]
Description=Unified VPN Subscription Panel (FastAPI)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/zinko/zinsubscriptionwebui-on-vps/python-sub-panel
Environment="PATH=/home/zinko/zinsubscriptionwebui-on-vps/python-sub-panel/venv/bin"
ExecStart=/home/zinko/zinsubscriptionwebui-on-vps/python-sub-panel/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
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

##### Production: Nginx Reverse Proxy + SSL

For production use with a domain name and HTTPS:

```bash
# 1. Install Nginx
apt install -y nginx

# 2. Create Nginx config
nano /etc/nginx/sites-available/vpn-panel
```

Paste the following (replace `yourdomain.com` with your actual domain):

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL certificates (will be obtained via Certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy settings
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
    }
}
```

```bash
# 3. Enable the site
ln -s /etc/nginx/sites-available/vpn-panel /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# 4. Obtain SSL certificate with Certbot
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com

# 5. Test auto-renewal
certbot renew --dry-run
```

Now access your panel at `https://yourdomain.com/<ADMIN_SECRET_PATH>`

---

### 🌐 Complete Domain Setup (Nginx + SSL)

This section covers the full end-to-end process for connecting your panel to a real domain with HTTPS.

#### 1. Buy / Prepare a Domain

- Buy a domain from any registrar (Namecheap, GoDaddy, Cloudflare, etc.)
- Example: `vpn.example.com`

#### 2. Point Domain to Your VPS

Go to your domain registrar or DNS provider and add an **A record**:

| Type | Name / Root | Value / IP | TTL |
|---|---|---|---|
| A | `@` | `<your-vps-ip>` | 3600 |
| A | `www` | `<your-vps-ip>` | 3600 |

Or if you are using a subdomain:

| Type | Name / Root | Value / IP | TTL |
|---|---|---|---|
| A | `vpn` | `<your-vps-ip>` | 3600 |

Verify DNS propagation:

```bash
dig vpn.example.com
# or
nslookup vpn.example.com
```

#### 3. Allow HTTP/HTTPS Through Firewall

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

#### 4. Install Nginx

```bash
apt update
apt install -y nginx
```

#### 5. Create Nginx Config

```bash
nano /etc/nginx/sites-available/vpn-panel
```

Paste the following (replace `vpn.example.com` with your actual domain):

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name vpn.example.com;

    # For Certbot challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name vpn.example.com;

    # SSL certificates (will be obtained via Certbot)
    ssl_certificate /etc/letsencrypt/live/vpn.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vpn.example.com/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Logging
    access_log /var/log/nginx/vpn-panel.access.log;
    error_log /var/log/nginx/vpn-panel.error.log;

    # Proxy settings
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

    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        access_log off;
    }
}
```

#### 6. Enable the Site

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

#### 7. Obtain SSL Certificate with Certbot

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

#### 8. Test Auto-Renewal

```bash
# Dry run
certbot renew --dry-run

# Check renewal timer
systemctl status certbot.timer
```

#### 9. Configure Application .env

Update your `.env` file:

```bash
cd /home/zinko/zinsubscriptionwebui-on-vps/python-sub-panel
nano .env
```

Make sure these values are set:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password_here
AUTH_SECRET=your_random_long_secret_key_here
CRON_SECRET=your_super_secret_cron_token_here
ADMIN_SECRET_PATH=daweitharlay
APP_NAME=My VPN Panel
```

**Important:** Change the default passwords and secrets to strong random values.

#### 10. Start / Restart the Application

##### If using Docker:

```bash
cd /home/zinko/zinsubscriptionwebui-on-vps/python-sub-panel
docker compose up -d --build
docker compose logs -f
```

##### If using systemd (venv):

```bash
systemctl restart vpn-panel
systemctl status vpn-panel
```

##### If running directly:

```bash
cd /home/zinko/zinsubscriptionwebui-on-vps/python-sub-panel
source venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

#### 11. Access Your Panel

Open your browser and visit:

```
https://vpn.example.com/daweitharlay
```

This will:
1. Hit the Nginx HTTPS server
2. Proxy to your FastAPI app on port 8000
3. Set the `path_auth` cookie
4. Redirect to the login page
5. After login, show the dashboard

#### 12. Verify Everything Works

```bash
# Check Nginx is running
systemctl status nginx

# Check your app is running
curl -I http://127.0.0.1:8000/health

# Check SSL certificate
openssl s_client -connect vpn.example.com:443 -servername vpn.example.com

# Check HTTPS response
curl -I https://vpn.example.com/health
```

---

#### Quick Troubleshooting

| Problem | Solution |
|---|---|
| `502 Bad Gateway` | App is not running on port 8000. Check `docker compose logs` or `systemctl status vpn-panel` |
| `SSL certificate error` | Certbot cert not obtained or expired. Run `certbot renew` |
| `Permission denied` | Check file permissions on `data/` folder: `chmod 755 data/` |
| `Connection refused` | Firewall blocking port 8000 or 443. Run `ufw status` |
| `404 after login` | Check `ADMIN_SECRET_PATH` in `.env` matches the URL you're visiting |

---

#### Environment Variables (Python Edition)

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
| `DATABASE_URL` | `sqlite:///./data/panel.db` | SQLite database path |

#### Background Tasks (Python Edition)

The Python edition includes built-in background tasks using APScheduler:

| Task | Frequency | Description |
|---|---|---|
| Usage Sync | Every `SYNC_INTERVAL_MINUTES` | Fetches metrics from all servers, calculates deltas, updates usage |
| Expiry Check | Daily at midnight | Blocks expired clients on all servers |
| Auto Backup | Daily at 3:00 AM | Uploads JSON backup to WebDAV if enabled |

No external crontab required — everything runs automatically when the app is running.

---

### 📊 Tech Stack Comparison

| Feature | Next.js Edition | Python FastAPI Edition |
|---|---|---|
| **Runtime** | Node.js 18+ | Python 3.11+ |
| **Database** | Supabase (PostgreSQL) | SQLite (file-based) |
| **Hosting** | Vercel + VPS Cron | Single VPS (Docker or Direct) |
| **RAM Usage** | ~150-300MB | ~30-50MB |
| **External Deps** | Supabase account required | Zero external dependencies |
| **Background Tasks** | VPS Crontab | Built-in APScheduler |
| **Best For** | Teams needing cloud DB | Solo operators, minimal VPS |

---

### 🔒 Security Features

* **Path-based secret gate** (`ADMIN_SECRET_PATH`) before login page
* **HTTP-only, SameSite=Strict session cookies**
* **Timing-safe credential comparison** to prevent timing attacks
* **Bearer token authentication** for all cron endpoints
* **5-second connection timeouts** on all external API requests
* **No sensitive data exposure** in logs or error messages

---

### 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

### 📄 License

This project is licensed under the MIT License.
