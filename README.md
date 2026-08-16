# 🚀 Unified VPN Subscription Panel (FastAPI + SQLite)

**VPS ပေါ်တွင် မိမိကိုယ်ပိုင် VPN Server များ (Outline, Hysteria2, 3x-ui / VLESS-WS) ကို တစ်နေရာတည်းမှ အလွယ်ကူဆုံး စီမံခန့်ခွဲနိုင်ပြီး ဖောက်သည်များအတွက် Universal One-Click Subscription Link ထုတ်ပေးနိုင်သော မြန်မာဘာသာ လမ်းညွှန်အပြည့်အစုံ ပါဝင်သည့် All-in-One Web UI စနစ်**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg?style=flat&logo=python)](https://python.org)
[![SQLite WAL](https://img.shields.io/badge/SQLite-WAL_Mode-003B57.svg?style=flat&logo=sqlite)](https://www.sqlite.org/wal.html)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=flat&logo=docker)](https://www.docker.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🌟 အဓိက ပါဝင်သော စွမ်းဆောင်ရည်များ (Key Features)

* **🌐 Multi-Protocol Support**:
  * **Outline** (Shadowsocks access keys with custom remark tags)
  * **Hysteria2** (Fast UDP Protocol with custom SNI & ports)
  * **3x-ui** (VLESS-WS / Reality Inbound parsing, Port 443 TLS, ExternalProxy auto-detection)
* **📱 Client Self-Service Web Portal (`/my/{token}`)**:
  * ဖောက်သည်များ မိမိဖုန်း Browser မှတစ်ဆင့် ကျန်ရှိသော ရက်နှင့် Data GB ကို တိုက်ရိုက် ကြည့်ရှုနိုင်ခြင်း။
  * **One-Click Auto Import Buttons**: **HAPP**, **v2rayTun**, **v2rayNG**, **Hiddify** App များထဲသို့ ခလုတ်တစ်ချက်နှိပ်ရုံဖြင့် Sublink အလိုအလျောက် သွင်းယူနိုင်ခြင်း။
  * **QR Code & Auto-Clipboard** အထောက်အပံ့ ပါဝင်ခြင်း။
* **⚡ Quick Renew & Action Buttons (`+30d`)**:
  * ဖောက်သည် သက်တမ်းကုန်သွားပါက ခလုတ်တစ်ချက်နှိပ်ရုံဖြင့် ရက် ၃၀ သက်တမ်းတိုးပေးပြီး Data Usage ကို 0 GB သို့ Reset ချပေးခြင်း။
* **📝 Customer Notes & Billing Info**:
  * ဖောက်သည်၏ Telegram/Phone Contact, ဝယ်ယူထားသော Plan Price (ဥပမာ- `5,000 MMK / VIP`) နှင့် KBZPay/WavePay ငွေပေးချေမှုမှတ်တမ်းများကို စနစ်တကျ မှတ်သားထားနိုင်ခြင်း။
* **⏸️ Server Maintenance Toggle (`✓ Enabled / ⏸ Maint`)**:
  * ဆာဗာတစ်ခုခု IP Change နေချိန် သို့မဟုတ် ပြင်ဆင်နေချိန်တွင် ခေတ္တပိတ်ထားရုံဖြင့် ဖောက်သည်များ၏ Sublink ထဲမှ အဆိုပါဆာဗာကို အလိုအလျောက် ခေတ္တ ဖယ်ထုတ်ပေးထားခြင်း။
* **🔄 Auto-Healing & Missing Keys Sync**:
  * ဆာဗာအသစ် ထပ်တိုးလိုက်ပါက ရှိပြီးသား Client အဟောင်းများအားလုံးအတွက် Key အသစ်များကို Background Cron (သို့မဟုတ်) `⚡ Sync All Missing Keys` ခလုတ်ဖြင့် အလိုအလျောက် ထုတ်ပေးခြင်း။
* **🚀 Ultra-Lightweight & Fast (VPS ပေါ်တွင် အလွန်ပေါ့ပါးခြင်း)**:
  * **SQLite WAL Mode (`journal_mode=WAL`)**: Concurrent Database Locks မဖြစ်ဘဲ Request များစွာ တစ်ပြိုင်နက် မြန်ဆန်စွာ အလုပ်လုပ်ခြင်း။
  * **30-Second RAM Cache**: Subscription Link များကို Memory တွင် Cache ထားရှိသဖြင့် VPS CPU/RAM သုံးစွဲမှုကို 0% နီးပါး လျှော့ချပေးထားခြင်း။
* **🛡️ OWASP Top 10 Security Protection**:
  * Anti Brute-Force Rate Limiting (၅ မိနစ်အတွင်း ၅ ကြိမ်မှားပါက ယာယီ Lock ချခြင်း)။
  * Secure Session Cookies (`HttpOnly`, `SameSite=Lax`) နှင့် Security Headers (`X-Frame-Options`, `X-Content-Type-Options`)။
  * Dynamic DB Password Management နှင့် Page အားလုံးတွင် လုံခြုံသော Logout စနစ် ပါဝင်ခြင်း။

---

## 🏗️ စနစ် အလုပ်လုပ်ပုံ (System Architecture)

```
  ┌─────────────────────────────────────────────────────────────┐
  │                 User Client Apps                            │
  │     (HAPP / v2rayTun / v2rayNG / Hiddify / Sing-box)        │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ Request Sub: /api/sub/{token} or /my/{token}
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                   Nginx + SSL (HTTPS)                       │
  │               (sub.yourdomain.com:443)                      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ Reverse Proxy
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │           Python Subscription WebUI (FastAPI)               │
  │  - SQLite (WAL Mode) + 30s RAM Cache (Port 8000)            │
  └──────────────┬───────────────┬───────────────┬──────────────┘
                 │               │               │
                 ▼               ▼               ▼
         ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
         │ Outline VPS   │ │ Hysteria2 VPS │ │  3x-ui VPS    │
         │ (Shadowsocks) │ │  (UDP Proxy)  │ │ (VLESS-WS)    │
         └───────────────┘ └───────────────┘ └───────────────┘
```

---

## 🚀 တပ်ဆင်နည်း (Installation) - အလွယ်ဆုံး ၁ ချက်နှိပ် စနစ် (Recommended)

သင့် VPS ရဲ့ Terminal / SSH ထဲတွင် အောက်ပါ **1-Line Command** ကို Run လိုက်ရုံဖြင့် စနစ်အားလုံးကို အလိုအလျောက် တပ်ဆင်စစ်ဆေးပေးပါမည်:

```bash
curl -fsSL https://raw.githubusercontent.com/uzinlay85/zinsubscriptionwebui-on-vps/main/python-sub-panel/setup.sh -o setup.sh && bash setup.sh
```

### 🤖 Script က အလိုအလျောက် စစ်ဆေးပြီး အမှားအယွင်းကင်းစွာ လုပ်ဆောင်ပေးမည့် အချက်များ (Zero-Error Automation):
1. **🔍 VLESS / 3x-ui ရှိပြီးသား VPS ကို အလိုအလျောက် သိရှိခြင်း (Auto-Detection)**:
   * Script က သင့် VPS ပေါ်တွင် VLESS ရှိ/မရှိ စစ်ဆေးပြီး `Detected existing VLESS / 3x-ui Nginx config` ဟု ပေါ်လာပါက **`y`** နှိပ်လိုက်ရုံဖြင့်:
     * မူလ VLESS Config ကို `.bak` အဖြစ် အလိုအလျောက် Backup ယူပေးခြင်း။
     * VLESS VPN (`/videos`) နှင့် 3x-ui (`/PANEL_PATH/`) ကို **လုံးဝ မထိခိုက်စေဘဲ** အသွင်ဖျက်နေရာ၌ Panel (`127.0.0.1:8000`) ကို **အလိုအလျောက် ထည့်သွင်းပေးခြင်း**။
     * `nginx -t` ဖြင့် Syntax အမှားအယွင်း ကင်းမကင်း အလိုအလျောက် စစ်ဆေးပြီးမှ Reload လုပ်ပေးခြင်း (Manual File Edit လုပ်စရာ မလိုပါ)။
2. **🐳 Docker & Dependencies Auto-Install**:
   * Docker, Docker Compose နှင့် လိုအပ်သော Packages များကို အလိုအလျောက် စစ်ဆေးတပ်ဆင်ပေးခြင်း။
3. **🌐 သီးသန့် VPS အသစ်ဖြစ်ပါက**:
   * Domain Name မေးမြန်းပြီး Nginx Reverse Proxy နှင့် Let's Encrypt Free SSL ကို အလိုအလျောက် ရယူပေးခြင်း။

---

## 🛠️ ကိုယ်တိုင် Manual ဖြင့် တစ်ဆင့်ချင်း တပ်ဆင်လိုသူများအတွက် (Manual Setup Guide)

အကယ်၍ Script မသုံးဘဲ မိမိကိုယ်တိုင် လက်ဖြင့် တစ်ဆင့်ချင်း စိတ်ကြိုက် တပ်ဆင်လိုပါက အောက်ပါ နည်းလမ်းများကို အသုံးပြုနိုင်ပါသည်:

### နည်းလမ်း (A) - VLESS + 3x-ui ရှိပြီးသား VPS ပေါ်တွင် Manual တပ်ဆင်နည်း (All-in-One Port 443)

```bash
# ၁။ Panel ကို Clone ဆွဲပြီး စတင်ပါ
git clone https://github.com/uzinlay85/zinsubscriptionwebui-on-vps.git /opt/vpn-sub-panel
cd /opt/vpn-sub-panel/python-sub-panel
cp .env.example .env
docker compose up -d --build

# ၂။ VLESS Nginx Config ဖွင့်ပါ
nano /etc/nginx/sites-available/vless
```

`location /` နေရာတွင် Subscription Panel (`127.0.0.1:8000`) ထည့်သွင်းပါ:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL Certificates (မူလအတိုင်း ထားပါ)
    ssl_certificate /etc/nginx/ssl/yourdomain.com/fullchain.cer;
    ssl_certificate_key /etc/nginx/ssl/yourdomain.com/private.key;

    # ၁။ 3X-UI Panel Proxy (မူလအတိုင်း)
    location /PANEL_PATH/ {
        proxy_pass http://127.0.0.1:2053;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # ၂။ VLESS WebSocket Proxy (မူလအတိုင်း Port 443 ဖြင့် အလုပ်လုပ်မည်)
    location /videos {
        proxy_redirect off;
        proxy_pass http://127.0.0.1:10000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # ၃။ Subscription Web Panel (Camouflage အစား Panel ကို ထည့်သွင်းခြင်း)
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Nginx စစ်ဆေးပြီး Reload လုပ်ပါ
sudo nginx -t && sudo systemctl reload nginx
```

> **🎉 ရလဒ်များ:**
> * `https://yourdomain.com/videos` -> **VLESS-WS VPN (Port 443)** ပုံမှန်အတိုင်း ချိတ်ဆက်အသုံးပြုနိုင်မည်။
> * `https://yourdomain.com/PANEL_PATH/` -> **3x-ui Panel** သို့ ပုံမှန်အတိုင်း ဝင်ရောက်နိုင်မည်။
> * `https://yourdomain.com` -> **Subscription Web Panel** သို့ HTTPS ဖြင့် ဝင်ရောက်နိုင်မည်။
> * `https://yourdomain.com/my/{token}` -> **Client Self-Service Portal (HAPP, v2rayTun, v2rayNG, Hiddify)** One-Click Import ချက်ချင်း အလုပ်လုပ်မည်။

---

## 🌐 သီးသန့် VPS အသစ်များအတွက် Domain & Free SSL သတ်မှတ်နည်း

အကယ်၍ VLESS မရှိသော သီးသန့် VPS အသစ်ပေါ်တွင် Panel တင်မည်ဆိုပါက:

### ၁။ Domain DNS Record သတ်မှတ်ခြင်း
Cloudflare သို့မဟုတ် သင့် Domain Provider တွင် A-Record ထည့်ပါ:
* **Type**: `A`
* **Name**: `sub` (သို့မဟုတ် `panel`)
* **IPv4**: `<သင့် VPS ၏ IP Address>`
* **Proxy Status**: DNS Only (သို့မဟုတ် SSL Full/Strict)

### ၂။ Nginx Reverse Proxy Config ရေးဆွဲခြင်း
```bash
apt update && apt install -y nginx certbot python3-certbot-nginx

# Nginx Site Config ဖိုင် ဖွင့်ပါ
nano /etc/nginx/sites-available/vpn_panel
```

အောက်ပါ Config ကို ထည့်သွင်းပါ (`sub.yourdomain.com` နေရာတွင် သင့် Domain အစားထိုးပါ):

```nginx
server {
    listen 80;
    server_name sub.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Nginx Enable လုပ်ပြီး Restart ချပါ
ln -sf /etc/nginx/sites-available/vpn_panel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Let's Encrypt Free SSL ရယူပါ
certbot --nginx -d sub.yourdomain.com
```

---

## 🖥️ VPN ဆာဗာများ ချိတ်ဆက်ထည့်သွင်းနည်း (Adding VPN Servers)

Web Panel သို့ ဝင်ရောက်ပြီး **Servers** -> **`+ Add Server`** ကို နှိပ်ပါ။

### 🔵 ၁။ Outline Server ချိတ်ဆက်နည်း
* **Server Type**: `Outline`
* **API URL**: Outline VPS ထဲတွင် `cat /opt/outline/access.txt` ရိုက်၍ ထွက်လာသော `apiUrl` ကို ထည့်ပါ။
* **Cert SHA-256**: `access.txt` ထဲရှိ `certSha256` တန်ဖိုးကို ထည့်ပါ။

---

### 🟣 ၂။ Hysteria2 Server ချိတ်ဆက်နည်း
* **Server Type**: `Hysteria2`
* **API URL**: သင့် Hysteria2 WebUI Domain (ဥပမာ- `https://bear-b.truehand.top/`)
* **Panel Admin Password**: Hysteria2 WebUI Admin Password (ဥပမာ- `admin123`)
* **External Domain**: ချိတ်ဆက်လိုသော Domain Name
* **External Port**: Hysteria2 Listen Port (ဥပမာ- `10443`)

---

### 🟢 ၃။ 3x-ui (VLESS-WS / Reality) ချိတ်ဆက်နည်း
* **Server Type**: `3x-ui`
* **API URL**: 3x-ui Panel ၏ URL နှင့် Port (ဥပမာ- `http://123.45.67.89:2053/` သို့မဟုတ် `https://panel.domain.com:2053/`)
* **Username**: 3x-ui Login Username (Default: `admin`)
* **Password**: 3x-ui Login Password
* **Inbound ID**: 3x-ui Panel -> Inbounds ဇယားရှိ `#` ကော်လံနံပါတ် (ဥပမာ- `1`)
* **External Domain**: VLESS SNI / Host Domain (ဥပမာ- `hostvds-vl.truehand.top`)
* **External Port**: TLS Port (ဥပမာ- `443`)

> 💡 **Tip**: 3x-ui ဆာဗာ အသစ်ထည့်ပြီးပါက Servers ဇယားရှိ **`🔄 Sync Keys`** သို့မဟုတ် အပေါ်ရှိ **`⚡ Sync All Missing Keys`** ကို နှိပ်လိုက်ရုံဖြင့် ရှိပြီးသား Client များအားလုံးအတွက် VLESS Key များကို တစ်ခါတည်း Batch Sync ထုတ်ပေးပါမည်။

---

## 👤 Clients စီမံခန့်ခွဲခြင်းနှင့် Web Portal အသုံးပြုနည်း

1. **Client အသစ် ထည့်သွင်းခြင်း**:
   * **Clients** -> **`+ Add Client`** နှိပ်ပါ။
   * အမည်၊ သက်တမ်းကုန်ဆုံးမည့်ရက်၊ Data Limit (GB)၊ Customer Contact (Telegram/Phone) နှင့် Plan Price တို့ကို ထည့်သွင်းပါ။
2. **Customer Self-Service Web Portal (`/my/{token}`)**:
   * Client Table ရှိ **`🌐 Portal`** ခလုတ်ကို နှိပ်၍ သို့မဟုတ် ဖောက်သည်ထံ `https://sub.yourdomain.com/my/{token}` လင့်ခ် ပေးပို့ပါ။
   * ဖောက်သည်သည် မိမိဖုန်းမှတစ်ဆင့် **HAPP**, **v2rayTun**, **v2rayNG**, **Hiddify** ခလုတ်များကို နှိပ်လိုက်ရုံဖြင့် အလိုအလျောက် VPN Config သွင်းနိုင်ပါမည်။
3. **သက်တမ်းတိုးခြင်း (Quick Renew)**:
   * Client Table ရှိ **`⚡ +30d`** ခလုတ်ကို နှိပ်လိုက်ရုံဖြင့် ရက် ၃၀ သက်တမ်းတိုးပေးပြီး အသုံးပြုထားသော Data ကို `0 GB` သို့ Reset ချပေးပါမည်။

---

## 🔍 စစ်ဆေးစမ်းသပ်နည်းများ (Testing & Verification)

```bash
# ၁။ Backend Health Check စစ်ဆေးရန်
curl http://localhost:8000/health
# Output: {"status":"ok","timestamp":"..."}

# ၂။ Client Subscription Link Output စစ်ဆေးရန်
curl -s http://localhost:8000/api/sub/<CLIENT_SUB_TOKEN> | base64 -d

# ၃။ 3x-ui / Hysteria2 Sync Logs များကို Live ကြည့်ရှုရန်
# (Docker သုံးထားပါက)
cd /opt/vpn-sub-panel/python-sub-panel && docker compose logs -f

# (Systemd Service သုံးထားပါက)
journalctl -u vpn-panel -f -n 50
```

---

## 🔄 Panel ကို Update ပြုလုပ်နည်း (Update Guide)

GitHub တွင် Feature အသစ်များ ထွက်ရှိလာပါက VPS ပေါ်တွင် အောက်ပါ Command (၁) ကြောင်းဖြင့် အလွယ်တကူ အဆင့်မြှင့်တင်နိုင်ပါသည်:

### Docker သုံးထားသူများအတွက်:
```bash
cd /opt/vpn-sub-panel/python-sub-panel && git pull origin main && docker compose up -d --build
```

### Systemd / Python သုံးထားသူများအတွက်:
```bash
cd /opt/vpn-sub-panel/python-sub-panel && git pull origin main && ./venv/bin/pip install -r requirements.txt && systemctl restart vpn-panel
```

---

## 📂 Project Directory Structure

```
python-sub-panel/
├── app/
│   ├── main.py                  # FastAPI Entrypoint, Middleware & Routes
│   ├── database.py              # SQLite WAL Mode & Auto-Migrations
│   ├── models.py                # SQLAlchemy ORM Models (Server, Client, ClientKey)
│   ├── schemas.py               # Pydantic Schemas & Request Validation
│   ├── tasks.py                 # Background Auto-Healing Sync Cron (30m)
│   ├── routers/
│   │   ├── auth.py              # Login/Logout & Rate Limiting Defense
│   │   ├── clients.py           # Client Management & Quick Renew (+30d)
│   │   ├── servers.py           # Server CRUD, Maintenance Toggle & Sync
│   │   ├── sub.py               # Universal Subscription Engine & RAM Cache
│   │   ├── settings.py          # App Branding & Configs
│   │   └── backup.py            # Database Backup & Restore
│   ├── services/
│   │   ├── vpn_manager.py       # Multi-VPN Orchestrator
│   │   ├── three_xui.py         # 3x-ui Auth, TLS ExternalProxy & Key Extractor
│   │   ├── hysteria2.py         # Hysteria2 Management Service
│   │   └── outline.py           # Outline Management Service
│   └── templates/
│       ├── portal.html          # Client Self-Service Web Portal (/my/{token})
│       ├── dashboard.html       # Admin Metrics & Realtime Stats
│       ├── servers.html         # Server Management with Maintenance Toggle
│       ├── clients.html         # Client Management & Quick Renew UI
│       ├── settings.html        # System Settings & Cloud Backup
│       └── login.html           # Admin Login Page
├── data/                        # SQLite Database Storage (vpn_panel.db)
├── docker-compose.yml           # Docker Orchestration
├── Dockerfile                   # Python Lightweight Container Image
├── requirements.txt             # Python Dependencies
└── setup.sh                     # 1-Click Automated VPS Installer
```

---

## 📄 License

MIT License - တည်ဆောက်သူ **Zin** မှ အခမဲ့ မျှဝေထားပါသည်။ လွတ်လပ်စွာ အသုံးပြုနိုင်ပါသည်။
