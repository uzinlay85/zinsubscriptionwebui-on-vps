# 🚀 Unified VPN Subscription Panel (FastAPI + SQLite)

**VPS ပေါ်တွင် ကိုယ်ပိုင် VPN Server များ (Outline, Hysteria2, 3x-ui) ကို တစ်နေရာတည်းမှ အလွယ်ကူဆုံး စီမံခန့်ခွဲနိုင်ပြီး Universal Subscription Link ထုတ်ပေးနိုင်သော မြန်မာဘာသာ လမ်းညွှန်ပါဝင်သည့် စနစ်**

---

## 🌟 အဓိက ပါဝင်သော စွမ်းဆောင်ရည်များ (Key Features)

* **Multi-Protocol Support**: **Outline**, **Hysteria2** (Express & ManusAi WebUI), နှင့် **3x-ui** (VLESS/VMess/Trojan) ဆာဗာများကို Panel တစ်ခုတည်းမှ စီမံနိုင်ခြင်း။
* **Universal Subscription Links**: Sing-box, Clash, v2rayN, NekoBox, Shadowrocket စသည့် မည်သည့် VPN App တွင်မဆို တိုက်ရိုက် အသုံးပြုနိုင်သော `/api/sub/[token]` လင့်ခ် ထုတ်ပေးခြင်း။
* **Zero-Downtime Resilience (ဆာဗာကျသွားသော်လည်း အလုပ်လုပ်ခြင်း)**:
  * ချိတ်ဆက်ထားသော ဆာဗာတစ်ခုခု ခေတ္တကျနေပါက 5-second timeout သတ်မှတ်ထားသဖြင့် Subscription Link မပျက်ဘဲ ကျန်ဆာဗာများ အလုပ်လုပ်နေခြင်း။
  * သက်တမ်းကုန်သွားသော/ပိတ်ထားသော အကောင့်များအတွက် VPN App ပေါ်တွင် `🚫 Account Disabled` သို့မဟုတ် `❌ Subscription Expired` ဟု ပြသပေးခြင်း။
* **Dynamic Key Generation**: ဆာဗာအသစ် ထပ်တိုးလိုက်ပါက Client က VPN App မှ Subscription Update လုပ်လိုက်သည်နှင့် Key အသစ် အလိုအလျောက် ရောက်ရှိသွားခြင်း။
* **Mobile-Responsive UI**: ဖုန်းမျက်နှာပြင်များတွင် Touch နှိပ်ရ လွယ်ကူသော Mobile Topbar, Menu Drawer နှင့် Scrollable Tables များ ပါဝင်ခြင်း။
* **Cloud Backup & Restore**: WebDAV (Koofr/Nextcloud) သို့မဟုတ် JSON Download/Upload ဖြင့် Database ကို အလွယ်တကူ Backup/Restore လုပ်နိုင်ခြင်း။

---

## 🏗️ စနစ် အလုပ်လုပ်ပုံ (Architecture)

```
  ┌───────────────────────────┐
  │   User VPN App            │
  │ (Shadowrocket / v2rayN /  │
  │  Clash / Sing-box)        │
  └─────────────┬─────────────┘
                │ Request Subscription (/api/sub/[token])
                ▼
  ┌───────────────────────────┐
  │  Nginx / Domain (HTTPS)   │
  └─────────────┬─────────────┘
                │ Reverse Proxy (Port 8000)
                ▼
  ┌───────────────────────────┐
  │  FastAPI Panel            │
  └─────────────┬─────────────┘
                │
                ├─► Outline Server (cat /opt/outline/access.txt)
                ├─► Hysteria2 Server (Hy2 WebUI / Express API)
                └─► 3x-ui Server (VLESS / VMess Inbound)
```

---

## 🚀 တပ်ဆင်နည်း အပြည့်အစုံ (Complete Setup Guide)

### နည်းလမ်း (၁) - 1-Click Automated Setup (အလွယ်ကူဆုံး နည်းလမ်း)

သင့် VPS ရဲ့ Terminal / SSH ထဲသို့ ဝင်ရောက်ပြီး အောက်ပါ Command ကို ရိုက်ထည့်ပါ-

```bash
curl -fsSL https://raw.githubusercontent.com/uzinlay85/zinsubscriptionwebui-on-vps/main/python-sub-panel/setup.sh -o setup.sh && bash setup.sh
```

**Script က အလိုအလျောက် ဆောင်ရွက်ပေးမည့် အချက်များ:**
1. ✅ Docker & Docker Compose တပ်ဆင်ပေးခြင်း။
2. ✅ Repository ကို `/opt/vpn-sub-panel` သို့ Clone ဆွဲယူပေးခြင်း။
3. ✅ လုံခြုံရေး လျှို့ဝှက်ချက် `.env` ဖိုင် ရေးဆွဲပေးခြင်း။
4. ✅ Docker Compose ဖြင့် Panel စတင်ပေးခြင်း။
5. ✅ Nginx + Domain SSL (HTTPS) ကို အလိုအလျောက် သတ်မှတ်ပေးခြင်း။

---

### နည်းလမ်း (၂) - Docker Compose ဖြင့် ကိုယ်တိုင် တပ်ဆင်နည်း (Manual Docker)

```bash
# 1. VPS ထဲသို့ ဝင်ပါ
ssh root@your-vps-ip

# 2. Repository Clone ဆွဲပါ
git clone https://github.com/uzinlay85/zinsubscriptionwebui-on-vps.git /opt/vpn-sub-panel
cd /opt/vpn-sub-panel/python-sub-panel

# 3. Environment Config ပြင်ဆင်ပါ
cp .env.example .env
nano .env

# 4. Docker Compose စတင်ပါ
docker compose up -d --build

# 5. Dashboard သို့ ဝင်ရောက်ပါ
# Browser: http://<your-vps-ip>:8000/<ADMIN_SECRET_PATH>
```

---

### နည်းလမ်း (၃) - Direct Python / venv နည်း (Docker မပါဘဲ တပ်ဆင်နည်း)

```bash
# 1. System packages များ တပ်ဆင်ပါ
apt update && apt install -y python3-venv python3-pip git build-essential

# 2. Project Clone ဆွဲပြီး venv တည်ဆောက်ပါ
git clone https://github.com/uzinlay85/zinsubscriptionwebui-on-vps.git /opt/vpn-sub-panel
cd /opt/vpn-sub-panel/python-sub-panel
python3 -m venv venv
source venv/bin/activate

# 3. Required packages များ တပ်ဆင်ပါ
pip install -r requirements.txt
cp .env.example .env

# 4. Panel Run ပါ
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 🌐 Domain & Free SSL (HTTPS) သတ်မှတ်နည်း

### ၁။ Domain DNS A-Record ချိန်နည်း
သင့် Domain Provider (Cloudflare / Namecheap) တွင် A Record တည်ဆောက်ပါ-
* **Type**: `A`
* **Name**: `sub` (သို့မဟုတ် `@`)
* **IPv4 Address**: `<သင့် VPS ၏ IP Address>`

### ၂။ Nginx Reverse Proxy & Certbot SSL
```bash
# Nginx နှင့် Certbot တပ်ဆင်ပါ
apt update && apt install -y nginx certbot python3-certbot-nginx

# Nginx Config တည်ဆောက်ပါ
nano /etc/nginx/sites-available/vpn_panel
```

အောက်ပါ Config ကို ထည့်သွင်းပါ (`sub.yourdomain.com` ကို သင့် Domain ဖြင့် အစားထိုးပါ):

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
# Nginx Enable လုပ်ပြီး SSL ရယူပါ
ln -sf /etc/nginx/sites-available/vpn_panel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Certbot ဖြင့် Free SSL ယူပါ
certbot --nginx -d sub.yourdomain.com
```

---

## 🖥️ ဆာဗာများ ထည့်သွင်းနည်း လမ်းညွှန် (Adding Servers)

Panel ရှိ **Servers** စာမျက်နှာ -> **`+ Add Server`** ကို နှိပ်ပါ။

---

### 🔵 1. Outline Server ထည့်သွင်းနည်း

| Field | ယူရမည့်နေရာ / ရှင်းလင်းချက် |
|---|---|
| **Server Name** | မိမိစိတ်ကြိုက် အမည် (ဥပမာ- `SG-Outline`) |
| **API URL** | Outline VPS ထဲတွင် `cat /opt/outline/access.txt` ရိုက်ပြီး `apiUrl` ကို ကူးယူပါ |
| **Cert SHA-256** | `access.txt` ထဲရှိ `certSha256` တန်ဖိုးကို ကူးယူပါ |

**`cat /opt/outline/access.txt` ထွက်ရှိချက် ဥပမာ:**
```json
{"apiUrl":"https://123.45.67.89:12345/SecretKey","certSha256":"AB:CD:EF:..."}
```

---

### 🟣 2. Hysteria2 Server ထည့်သွင်းနည်း

| Field | ယူရမည့်နေရာ / ရှင်းလင်းချက် |
|---|---|
| **Server Name** | မိမိစိတ်ကြိုက် အမည် (ဥပမာ- `Bear Hysteria2`) |
| **API URL** | သင့် Hysteria2 WebUI / Server ၏ Domain URL (ဥပမာ- `https://bear-b.truehand.top/`) |
| **Panel Admin Password** | သင့် Hysteria2 Panel ၏ Admin Password (မပြောင်းရသေးပါက **`admin123`**) |
| **External Domain** | မိမိ သုံးလိုသော Domain (မထည့်ပါက API URL Domain ကို သုံးပါမည်) |
| **External Port** | Hysteria2 Listen Port (Default: `10443`) |

---

### 🟢 3. 3x-ui Server ထည့်သွင်းနည်း

| Field | ယူရမည့်နေရာ / ရှင်းလင်းချက် |
|---|---|
| **Server Name** | မိမိစိတ်ကြိုက် အမည် (ဥပမာ- `HK 3x-ui`) |
| **3x-ui Panel URL** | 3x-ui Panel ၏ URL နှင့် Port (ဥပမာ- `http://123.45.67.89:2053/`) |
| **3x-ui Username** | 3x-ui Admin Username (Default: `admin`) |
| **3x-ui Password** | 3x-ui Admin Password |
| **Inbound ID** | 3x-ui Panel -> Inbounds ဇယားရှိ **#** ကော်လံ၏ ဂဏန်း (ဥပမာ- `1`) |
| **External Domain** | VLESS / VMess SNI domain (Optional) |
| **External Port** | VLESS / VMess port (Optional) |

---

## 👤 Clients စီမံခန့်ခွဲခြင်း (Managing Clients)

1. **Client ထည့်သွင်းခြင်း**: **Clients** -> **`+ Add Client`** ကို နှိပ်ပြီး Name, Expiry Date, Data Limit သတ်မှတ်ပါ။
2. **Subscription Link ရယူခြင်း**: Client ဘေးရှိ **`📋 Copy Sub Link`** ကို နှိပ်၍ VPN App များထဲသို့ ထည့်သွင်းပါ။
3. **Access Keys ကြည့်ရှုခြင်း**: **`🔑 View Keys`** ကို နှိပ်၍ ဆာဗာတစ်ခုချင်းစီ၏ `hy2://` သို့မဟုတ် `vless://` သီးသန့် Key များကို ကူးယူနိုင်ပါသည်။

---

## 🔄 အသုံးဝင်သော VPS Command များ (Useful Commands)

```bash
# ၁။ Panel ကို အဆင့်မြှင့်တင်ရန် (Git Pull & Rebuild)
cd /opt/vpn-sub-panel/python-sub-panel
git pull origin main
docker compose down
docker compose up -d --build

# ၂။ Container Logs ကြည့်ရန်
docker compose logs -f

# ၃။ Status စစ်ဆေးရန်
docker compose ps
```

---

## 📄 License
MIT License - တည်ဆောက်သူ **Zin** မှ အခမဲ့ မျှဝေထားပါသည်။
