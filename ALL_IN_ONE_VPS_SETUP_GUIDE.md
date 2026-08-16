# 🌐 All-in-One Single VPS Deployment Guide (4-in-1 System)
> **Domain တစ်ခုတည်း၊ VPS တစ်ခုတည်းပေါ်တွင် VPN (၃) မျိုး + Unified Sublink Panel (၁) ခု တပ်ဆင်အသုံးပြုနည်း လမ်းညွှန်**

ဤလမ်းညွှန်သည် Single VPS Server (Ubuntu 22.04 / 24.04) တစ်ခုတည်းပေါ်တွင် **Domain တစ်ခုတည်း (ဥပမာ- `bear-new.truehand.top`)** ဖြင့် အောက်ပါ စနစ် (၄) မျိုးလုံးကို တစ်ခုနှင့်တစ်ခု လုံးဝ မထိခိုက်စေဘဲ အတူတကွ တွဲဖက်တပ်ဆင် လည်ပတ်စေနိုင်သော အပြည့်စုံဆုံး လက်တွေ့စမ်းသပ်ပြီး လမ်းညွှန်ဖြစ်ပါသည်။

---

## 🏗️ စနစ်တည်ဆောက်ပုံ (System Architecture & Port Layout)

| စနစ် (System) | အမျိုးအစား (Type) | Port / Path | လုပ်ဆောင်ချက် |
| :--- | :--- | :--- | :--- |
| **Unified Sublink Panel** | Central Web UI & Subscription | `Port 443` (`location /`) | ဖောက်သည်များ စီမံခြင်း၊ All-in-One Sublink ထုတ်ပေးခြင်း |
| **VLESS-WS** | Xray Core (3x-ui) | `Port 443` (`location /videos`) | Nginx Reverse Proxy မှတစ်ဆင့် CDN/TLS လုံခြုံစွာ သွယ်တန်းခြင်း |
| **3x-ui Management WebUI** | VPN Core Web Panel | `Port 443` (`location /<PANEL_PATH>/`) | Xray Inbounds စီမံခန့်ခွဲသည့် လျှို့ဝှက် Web Panel |
| **Hysteria 2 Management WebUI** | Hy2 Flask Web Panel | `Port 443` (`location /hy2/`) | Hysteria 2 အသုံးပြုသူများ ကြည့်ရှုစီမံသည့် Web Panel |
| **Hysteria 2 Server** | UDP Protocol | `Port 10443 (UDP)` | အင်တာနက် အမြန်နှုန်းမြင့် UDP Proxy Server |
| **Outline Server** | Shadowsocks (Docker) | `Port 8443 (TCP/UDP)` | Shadowsocks Outline VPN Proxy Server |

---

## 📋 ကြိုတင် ပြင်ဆင်ရန် အချက်များ (Prerequisites)

1. **Ubuntu 22.04 သို့မဟုတ် 24.04 VPS** (Root Access)
2. **Domain Name တစ်ခု** (ဥပမာ- `bear-new.truehand.top`)
   * Cloudflare (သို့မဟုတ် DNS Provider) တွင် DNS **A Record** အား VPS Public IP သို့ ညွှန်ထားပါ (DNS Only / Proxy Disabled အနေအထား ဖြစ်ရပါမည်)။

---

## 🚀 အဆင့်ဆင့် တပ်ဆင်နည်း (Step-by-Step Installation)

### 🔹 အဆင့် (၁) - Outline Server တပ်ဆင်ခြင်း

1. Firewall Port များကို ဖွင့်ပါ:
```bash
sudo ufw allow 8443/tcp
sudo ufw allow 8443/udp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw allow 80/tcp
sudo ufw reload
```

2. Outline Server Install Script ကို Port 8443 သတ်မှတ်၍ Run ပါ:
```bash
wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh | sudo bash -s -- --keys-port=8443
```

3. တပ်ဆင်ပြီးပါက ထွက်လာသော **apiUrl** နှင့် **certSha256** ကို မှတ်သားထားပါ:
```json
{"apiUrl":"https://185.126.65.101:38790/ROYAt0gkWj0b_hyv1woGkg","certSha256":"376C7B20A846943967EA195E6E61C4AAB3FCD1E767B3CDB364A7586D7BF9924E"}
```

---

### 🔹 အဆင့် (၂) - Hysteria 2 Server & SSL တပ်ဆင်ခြင်း

1. Hysteria 2 1-Click Installer ကို Run ပါ:
```bash
wget -O install.sh https://raw.githubusercontent.com/uzinlay85/Hy2_WebUI_ManusAi/main/install_hysteria.sh && bash install.sh
```

2. မေးခွန်းများ ဖြေဆိုပါ:
   * **Domain Name**: သင့် Domain ထည့်ပါ (ဥပမာ- `bear-new.truehand.top`)
   * **Port**: `10443`
   * **Admin Password**: `admin123` (သို့မဟုတ် မိမိကြိုက်နှစ်သက်ရာ)
   * **Cloudflare Port Range**: `n` (No - Single Port သာ အသုံးပြုပါမည်)

*(ဤအဆင့်တွင် Certbot က သင့် Domain အတွက် SSL Certificate `/etc/letsencrypt/live/<DOMAIN>/` ကို အလိုအလျောက် ရယူပြီးဖြစ်ပါသည်)*

---

### 🔹 အဆင့် (၃) - 3x-ui (VLESS) တပ်ဆင်ခြင်း

1. 3x-ui Installer ကို Run ပါ:
```bash
bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh)
```

2. မေးခွန်းများ ဖြေဆိုပါ:
   * Customize settings? -> **`y`**
   * **Username**: `zinko`
   * **Password**: `Zinkoaung@159`
   * **Port**: **`2053`**
   * **SSL Certificate Setup**: **`4. Skip SSL`** (Nginx က SSL ကို ကိုင်တွယ်ပါမည်)
   * **Bind to 127.0.0.1**: **`n`**

3. ထွက်လာသော **WebBasePath** (ဥပမာ- `UNUqiDuaa0rN3RmZYP`) ကို သေချာ မှတ်သားထားပါ။

---

### 🔹 အဆင့် (၄) - All-in-One Nginx Reverse Proxy ရေးဆွဲခြင်း

Domain (`bear-new.truehand.top`) နှင့် WebBasePath (`UNUqiDuaa0rN3RmZYP`) တို့ကို အောက်ပါ Script ထဲတွင် မိမိ Domain/Path ဖြင့် အစားထိုးပြီး Run ပါ:

```bash
# Nginx site အဟောင်းများကို ရှင်းထုတ်ခြင်း
sudo rm -f /etc/nginx/sites-enabled/*

cat << 'EOF' > /etc/nginx/sites-available/vless
server {
    listen 80;
    server_name bear-new.truehand.top;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name bear-new.truehand.top;

    # SSL Certificates (Hysteria 2 က ထုတ်ယူထားသော တရားဝင် Let's Encrypt SSL)
    ssl_certificate /etc/letsencrypt/live/bear-new.truehand.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bear-new.truehand.top/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # ၁။ 3X-UI Web Panel Proxy
    location /UNUqiDuaa0rN3RmZYP/ {
        proxy_pass http://127.0.0.1:2053;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # ၂။ VLESS WebSocket VPN Proxy
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

    # ၃။ Hysteria 2 မူရင်း Web Management Panel
    location /hy2/ {
        proxy_pass http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ၄။ Unified Subscription Web Panel (Root)
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/vless /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

### 🔹 အဆင့် (၅) - 3x-ui Panel တွင် VLESS Inbound ဖန်တီးခြင်း

1. Browser တွင် **`https://bear-new.truehand.top/UNUqiDuaa0rN3RmZYP/`** သို့ ဝင်ပါ။
2. **Inbounds** -> **`+ Add Inbound`** ကို နှိပ်ပါ။
3. အောက်ပါအတိုင်း သတ်မှတ်ပါ:
   * **Remark**: `Bear_Vless`
   * **Protocol**: `vless`
   * **Listening IP**: `127.0.0.1`
   * **Port**: `10000`
   * **Network**: `ws`
   * **Path**: `/videos`
   * **TLS**: `none`
   * **External Proxy (အောက်ခြေ)**:
     * Dest: `bear-new.truehand.top`
     * Port: `443`
     * Force TLS: `tls`
     * SNI: `bear-new.truehand.top`
4. **Save** ကို နှိပ်ပါ။

---

### 🔹 အဆင့် (၆) - Unified Sublink Web Panel တပ်ဆင်ခြင်း (1-Click)

1. Sublink Panel Installer ကို Run ပါ:
```bash
curl -fsSL https://raw.githubusercontent.com/uzinlay85/zinsubscriptionwebui-on-vps/main/python-sub-panel/setup.sh -o setup.sh && bash setup.sh
```

2. `[!] Detected existing VLESS / 3x-ui Nginx config` ဟု မေးလာပါက **`y`** နှိပ်ပါ။

3. တပ်ဆင်ပြီးပါက Panel လိပ်စာကို Browser တွင် ဖွင့်ပါ:
👉 **`https://bear-new.truehand.top/<ADMIN_SECRET_PATH>`**

*(Admin Username & Password စစ်ဆေးရန်: `cat /opt/vpn-sub-panel/python-sub-panel/.env | grep ADMIN`)*

---

## 🔗 Sublink Panel ထဲတွင် Server (၃) ခု ချိတ်ဆက်ခြင်း

Panel ပွင့်လာပါက **Servers Tab** -> **`+ Add Server`** ဖြင့် အောက်ပါ ဆာဗာများကို ထည့်သွင်းပါ:

### 1️⃣ Outline Server:
* **Server Type**: `Outline`
* **Server Name**: `Bear_Outline`
* **API URL**: `https://185.126.65.101:38790/ROYAt0gkWj0b_hyv1woGkg`
* **Cert SHA-256**: `376C7B20A846943967EA195E6E61C4AAB3FCD1E767B3CDB364A7586D7BF9924E`

### 2️⃣ Hysteria 2 Server:
* **Server Type**: `Hysteria2`
* **Server Name**: `Bear_Hy2`
* **API URL**: `https://bear-new.truehand.top/hy2/` (သို့မဟုတ် `http://host.docker.internal:5000`)
* **Panel Admin Password**: `admin123`
* **External Domain**: `bear-new.truehand.top`
* **External Port**: `10443`

### 3️⃣ 3x-ui (VLESS) Server:
* **Server Type**: `3x-ui`
* **Server Name**: `Bear_Vless`
* **API URL**: `https://bear-new.truehand.top/UNUqiDuaa0rN3RmZYP/` (သို့မဟုတ် `http://127.0.0.1:2053/`)
* **Username**: `zinko`
* **Password**: `Zinkoaung@159`
* **Inbound ID**: `1`

---

## 🧪 အသုံးဝင်သော စစ်ဆေးရေး Commands များ (Useful Commands)

* **Hysteria 2 Database ထဲတွင် User ရှိမရှိ စစ်ဆေးရန်**:
```bash
sqlite3 /opt/hysteria-panel/users.db "SELECT * FROM users;"
```

* **Sublink Panel Logs ကြည့်ရန်**:
```bash
cd /opt/vpn-sub-panel/python-sub-panel && docker compose logs -f
```

* **Sublink Panel အား နောက်ဆုံး Version သို့ 1-Click Update လုပ်ရန်**:
```bash
cd /opt/vpn-sub-panel/python-sub-panel && git pull origin main && docker compose up -d --build
```

* **Nginx Configuration စစ်ဆေးရန်**:
```bash
sudo nginx -t && sudo systemctl reload nginx
```
