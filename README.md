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
└── README.md
```

#### ⚙️ VPS Deployment (Python Edition)

```bash
# 1. SSH into your VPS
ssh ubuntu@your-vps-ip

# 2. Clone or copy the project
git clone https://github.com/uzinlay85/zinsubscriptionwebui-on-vps.git
cd zinsubscriptionwebui-on-vps/python-sub-panel

# 3. Copy environment file and edit
cp .env.example .env
nano .env

# 4. Start with Docker Compose
docker compose up -d --build

# 5. Access admin panel
# Browser: http://<your-vps-ip>:8000/<ADMIN_SECRET_PATH>
```

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

No external crontab required — everything runs inside the container.

---

### 📊 Tech Stack Comparison

| Feature | Next.js Edition | Python FastAPI Edition |
|---|---|---|
| **Runtime** | Node.js 18+ | Python 3.11+ |
| **Database** | Supabase (PostgreSQL) | SQLite (file-based) |
| **Hosting** | Vercel + VPS Cron | Single VPS (Docker) |
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
