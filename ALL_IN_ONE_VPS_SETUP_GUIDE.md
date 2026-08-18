# 🌐 All-in-One Single VPS Deployment Guide (5-in-1 System)
> **Domain တစ်ခုတည်း၊ VPS တစ်ခုတည်းပေါ်တွင် VPN (၄) မျိုး + Unified Sublink Panel (၁) ခု တပ်ဆင်အသုံးပြုနည်း လမ်းညွှန်**

ဤလမ်းညွှန်သည် Single VPS Server (Ubuntu 22.04 / 24.04) တစ်ခုတည်းပေါ်တွင် **Domain တစ်ခုတည်း (ဥပမာ- `sub.yourdomain.com`)** ဖြင့် အောက်ပါ စနစ် (၅) မျိုးလုံးကို တစ်ခုနှင့်တစ်ခု လုံးဝ မထိခိုက်စေဘဲ အတူတကွ တွဲဖက်တပ်ဆင် လည်ပတ်စေနိုင်သော အပြည့်စုံဆုံး လက်တွေ့စမ်းသပ်ပြီး လမ်းညွှန်ဖြစ်ပါသည်။

---

## 🏗️ စနစ်တည်ဆောက်ပုံ (System Architecture & Port Layout)

| စနစ် (System) | အမျိုးအစား (Type) | Port / Path | လုပ်ဆောင်ချက် |
| :--- | :--- | :--- | :--- |
| **Unified Sublink Panel** | Central Web UI & Subscription | `Port 443` (`location /`) | ဖောက်သည်များ စီမံခြင်း၊ All-in-One Sublink ထုတ်ပေးခြင်း |
| **VLESS-WS** | Xray Core (3x-ui) | `Port 443` (`location /videos`) | Nginx Reverse Proxy မှတစ်ဆင့် CDN/TLS လုံခြုံစွာ သွယ်တန်းခြင်း |
| **3x-ui Management WebUI** | VPN Core Web Panel | `Port 443` (`location /<YOUR_PANEL_PATH>/`) | Xray Inbounds စီမံခန့်ခွဲသည့် လျှို့ဝှက် Web Panel |
| **Hysteria 2 Management WebUI** | Hy2 Flask Web Panel | `Port 443` (`location /hy2/`) | Hysteria 2 အသုံးပြုသူများ ကြည့်ရှုစီမံသည့် Web Panel |
| **AmneziaWG 2.0 Management WebUI** | AWG Web Panel | `Port 443` (`location /awg/`) | AmneziaWG Client များ စီမံထုတ်ပေးသည့် Web Panel |
| **Hysteria 2 Server** | UDP Protocol | `Port 10443 (UDP)` | အင်တာနက် အမြန်နှုန်းမြင့် UDP Proxy Server |
| **Outline Server** | Shadowsocks (Docker) | `Port 8443 (TCP/UDP)` | Shadowsocks Outline VPN Proxy Server |
| **AmneziaWG 2.0 Server** | QUIC-mimicry Obfuscated UDP | `Port 58210 (UDP)` | အဆင့်မြင့်ဆုံး ပုံဖျက်ထားသော WireGuard VPN Server |

---

## 📋 ကြိုတင် ပြင်ဆင်ရန် အချက်များ (Prerequisites)

1. **Ubuntu 22.04 သို့မဟုတ် 24.04 VPS** (Root Access)
2. **Domain Name တစ်ခု** (ဥပမာ- `sub.yourdomain.com`)
   * Cloudflare (သို့မဟုတ် DNS Provider) တွင် DNS **A Record** အား VPS Public IP သို့ ညွှန်ထားပါ (DNS Only / Proxy Disabled အနေအထား ဖြစ်ရပါမည်)။

---

## 🚀 အဆင့်ဆင့် တပ်ဆင်နည်း (Step-by-Step Installation)

### 🔹 အဆင့် (၁) - အခြေခံ Packages များ၊ Docker သွင်းခြင်းနှင့် Firewall Ports များ ပြင်ဆင်ခြင်း

1. အခြေခံ လိုအပ်သော Tools (git, curl, wget, ufw) များ သွင်းပါ:
```bash
sudo apt update && sudo apt install -y git curl wget ufw
```

2. Docker နှင့် Legacy NAT Module ဖွင့်ခြင်း (AmneziaWG & Outline အတွက် လိုအပ်ပါသည်):
```bash
# Docker သွင်းခြင်း
curl -fsSL https://get.docker.com | sudo bash
sudo systemctl enable --now docker

# NAT module ဖွင့်ခြင်း
sudo modprobe iptable_nat
echo "iptable_nat" | sudo tee /etc/modules-load.d/iptable_nat.conf
```

3. Firewall Port များကို ဖွင့်ပါ:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw allow 8443/tcp
sudo ufw allow 8443/udp
sudo ufw allow 10443/udp
sudo ufw allow 58210/udp
sudo ufw reload
```

---

### 🔹 အဆင့် (၂) - Outline Server တပ်ဆင်ခြင်း (Domain ဖြင့် တိုက်ရိုက် သတ်မှတ်ခြင်း)

1. သင့် Domain အား Variable သတ်မှတ်၍ Outline Server Install Script ကို Run ပါ (Port 8443 + Hostname):
```bash
export DOMAIN="sub.yourdomain.com"

wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh | sudo bash -s -- --keys-port=8443 --hostname="$DOMAIN"
```

2. တပ်ဆင်ပြီးပါက ထွက်လာသော **apiUrl** နှင့် **certSha256** JSON စာကြောင်းသည် Domain Name ဖြင့် အလိုအလျောက် ထွက်လာပါမည် (နမူနာ):
```json
{"apiUrl":"https://sub.yourdomain.com:38790/RANDOM_SECRET_KEY","certSha256":"YOUR_CERT_SHA256_HEX_STRING"}
```
*(ဤသို့ `--hostname` ထည့်သွင်းခြင်းကြောင့် Outline Management API URL သာမက ထွက်ရှိလာမည့် Shadowsocks Client Access Keys များအားလုံးတွင်ပါ IP အစား Domain Name ဖြင့် အလိုအလျောက် ထွက်ပေါ်လာမည် ဖြစ်ပါသည်)*

---

### 🔹 အဆင့် (၃) - Hysteria 2 Server & SSL တပ်ဆင်ခြင်း

1. Hysteria 2 1-Click Installer ကို Run ပါ:
```bash
wget -O install.sh https://raw.githubusercontent.com/uzinlay85/Hy2_WebUI_ManusAi/main/install_hysteria.sh && bash install.sh
```

2. မေးခွန်းများ ဖြေဆိုပါ:
   * **Domain Name**: သင့် Domain ထည့်ပါ (ဥပမာ- `sub.yourdomain.com`)
   * **Port**: `10443`
   * **Admin Password**: `admin123` (သို့မဟုတ် မိမိကြိုက်နှစ်သက်ရာ Password)
   * **Cloudflare Port Range**: `n` (No - Single Port သာ အသုံးပြုပါမည်)

*(ဤအဆင့်တွင် Certbot က သင့် Domain အတွက် SSL Certificate `/etc/letsencrypt/live/<YOUR_DOMAIN>/` ကို အလိုအလျောက် ရယူပေးပြီးဖြစ်ပါသည်)*

---

### 🔹 အဆင့် (၄) - 3x-ui (VLESS) တပ်ဆင်ခြင်း

1. 3x-ui Installer ကို Run ပါ:
```bash
bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh)
```

2. မေးခွန်းများ ဖြေဆိုပါ:
   * Customize settings? -> **`y`**
   * **Username**: `admin` (သို့မဟုတ် မိမိစိတ်ကြိုက် Username)
   * **Password**: `YourStrongPassword` (မိမိစိတ်ကြိုက် Password)
   * **Port**: **`2053`**
   * **SSL Certificate Setup**: **`4. Skip SSL`** (Nginx က SSL ကို ကိုင်တွယ်ပါမည်)
   * **Bind to 127.0.0.1**: **`n`**

3. ထွက်လာသော **WebBasePath** (ဥပမာ- `UNUqiDuaa0rN3RmZYP` စသည့် လျှို့ဝှက် Path) ကို သေချာ မှတ်သားထားပါ။

---

### 🔹 အဆင့် (၅) - AmneziaWG 2.0 တပ်ဆင်ခြင်း (zin-awg-easy2)

1. Source code ကို clone ဆွဲပြီး Docker image build ပြုလုပ်ပါ:
```bash
git clone https://github.com/uzinlay85/zin-awg-easy2.git /opt/zin-awg-easy2
cd /opt/zin-awg-easy2
sudo docker build -t amnezia-wg-easy:2.0 .
```

2. Domain နှင့် Password သတ်မှတ်ပြီး Hash Code ထုတ်ပါ:
```bash
export DOMAIN="sub.yourdomain.com"
export AWG_PASSWORD="YourAWGStrongPassword"
export HASH=$(sudo docker run -i amnezia-wg-easy:2.0 wgpw "$AWG_PASSWORD" | cut -d"'" -f2)
```

3. AmneziaWG 2.0 Container ကို စတင် Run ပါ:
```bash
sudo rm -f ~/.amnezia-wg-easy/wg0.json ~/.amnezia-wg-easy/wg0.conf

sudo docker run -d \
  --name=amnezia-wg-easy \
  -e WG_HOST="$DOMAIN" \
  -e PASSWORD_HASH="$HASH" \
  -e PORT=51831 \
  -e WG_PORT=58210 \
  -e WG_MTU=1200 \
  -e WG_PERSISTENT_KEEPALIVE=25 \
  -e UI_ENABLE_SORT_CLIENTS=true \
  -e UI_TRAFFIC_STATS=true \
  -e WG_ENABLE_EXPIRES_TIME=true \
  -e WG_ENABLE_ONE_TIME_LINKS=true \
  -v ~/.amnezia-wg-easy:/etc/wireguard \
  -p 58210:58210/udp \
  -p 127.0.0.1:51831:51831/tcp \
  --cap-add=NET_ADMIN \
  --cap-add=SYS_MODULE \
  --sysctl="net.ipv4.conf.all.src_valid_mark=1" \
  --sysctl="net.ipv4.ip_forward=1" \
  --device=/dev/net/tun:/dev/net/tun \
  --restart unless-stopped \
  amnezia-wg-easy:2.0
```

---

### 🔹 အဆင့် (၆) - All-in-One Nginx Reverse Proxy ရေးဆွဲခြင်း

ပထမဦးစွာ သင့် Domain နှင့် 3x-ui Base Path တို့ကို Environment Variable အနေဖြင့် သတ်မှတ်ပါ:

```bash
export DOMAIN="sub.yourdomain.com"
export PANEL_PATH="YOUR_PANEL_PATH"
```

ထို့နောက် အောက်ပါ Command တစ်ခုလုံးကို Copy ကူးပြီး Terminal တွင် Run ပါ:

```bash
# Nginx site အဟောင်းများကို ရှင်းထုတ်ခြင်း
sudo rm -f /etc/nginx/sites-enabled/*

cat << 'EOF' > /etc/nginx/sites-available/vless
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;

    # SSL Certificates (Let's Encrypt SSL)
    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # ၁။ 3X-UI Web Panel Proxy
    location /PANEL_PATH_PLACEHOLDER/ {
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

    # ၄။ AmneziaWG 2.0 Web Management Panel
    location /awg/ {
        proxy_pass http://127.0.0.1:51831/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ၅။ Unified Subscription Web Panel (Root)
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Placeholder များအား အစားထိုးခြင်း
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/vless
sed -i "s/PANEL_PATH_PLACEHOLDER/$PANEL_PATH/g" /etc/nginx/sites-available/vless

sudo ln -sf /etc/nginx/sites-available/vless /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

### 🔹 အဆင့် (၇) - 3x-ui Panel တွင် VLESS Inbound ဖန်တီးခြင်း

1. Browser တွင် **`https://sub.yourdomain.com/<YOUR_PANEL_PATH>/`** သို့ ဝင်ပါ။
2. **Inbounds** -> **`+ Add Inbound`** ကို နှိပ်ပါ။
3. အောက်ပါအတိုင်း သတ်မှတ်ပါ:
   * **Remark**: `HK-VLESS`
   * **Protocol**: `vless`
   * **Listening IP**: `127.0.0.1`
   * **Port**: `10000`
   * **Network**: `ws`
   * **Path**: `/videos`
   * **TLS**: `none`
   * **External Proxy (အောက်ခြေ)**:
     * Dest: `sub.yourdomain.com` (သင့် Domain)
     * Port: `443`
     * Force TLS: `tls`
     * SNI: `sub.yourdomain.com` (သင့် Domain)
4. **Save** ကို နှိပ်ပါ။

---

### 🔹 အဆင့် (၈) - Unified Sublink Web Panel တပ်ဆင်ခြင်း (1-Click)

1. Sublink Panel Installer ကို Run ပါ:
```bash
curl -fsSL https://raw.githubusercontent.com/uzinlay85/zinsubscriptionwebui-on-vps/main/python-sub-panel/setup.sh -o setup.sh && bash setup.sh
```

2. `[!] Detected existing VLESS / 3x-ui Nginx config` ဟု မေးလာပါက **`y`** နှိပ်ပါ။

3. တပ်ဆင်ပြီးပါက Panel လိပ်စာကို Browser တွင် ဖွင့်ပါ:
👉 **`https://sub.yourdomain.com/<ADMIN_SECRET_PATH>`**

*(Admin Username & Password စစ်ဆေးရန်: `cat /opt/vpn-sub-panel/python-sub-panel/.env | grep ADMIN`)*

---

## 🔗 Sublink Panel ထဲတွင် Server များကို ချိတ်ဆက်ခြင်း

Panel ပွင့်လာပါက **Servers Tab** -> **`+ Add Server`** ဖြင့် အောက်ပါ ဆာဗာများကို ထည့်သွင်းပါ:

### 1️⃣ Outline Server:
* **Server Type**: `Outline`
* **Server Name**: `Outline HK`
* **API URL**: `https://sub.yourdomain.com:38790/RANDOM_SECRET_KEY`
* **Cert SHA-256**: `YOUR_CERT_SHA256_HEX_STRING`

### 2️⃣ Hysteria 2 Server:
* **Server Type**: `Hysteria2`
* **Server Name**: `Hy2 HK`
* **API URL**: `https://sub.yourdomain.com/hy2/` (သို့မဟုတ် `http://host.docker.internal:5000`)
* **Panel Admin Password**: `admin123` (သင့် Hy2 Admin Pass)
* **External Domain**: `sub.yourdomain.com`
* **External Port**: `10443`

### 3️⃣ 3x-ui (VLESS) Server:
* **Server Type**: `3x-ui`
* **Server Name**: `VLESS HK`
* **API URL**: `https://sub.yourdomain.com/<YOUR_PANEL_PATH>/` (သို့မဟုတ် `http://127.0.0.1:2053/`)
* **Username**: `admin`
* **Password**: `YourStrongPassword`
* **Inbound ID**: `1`

---

## 🌐 Web Panels အားလုံးသို့ တိုက်ရိုက် ဝင်ရောက်ရန် လိပ်စာများ (Single Domain Overview)

| Panel အမည် | Browser URL | Default Password / Note |
| :--- | :--- | :--- |
| **Unified Sublink Panel** | `https://sub.yourdomain.com/<ADMIN_SECRET_PATH>` | `.env` ထဲရှိ ADMIN Credentials |
| **3x-ui (VLESS) Panel** | `https://sub.yourdomain.com/<YOUR_PANEL_PATH>/` | သင်သတ်မှတ်ခဲ့သော 3x-ui Username/Pass |
| **Hysteria 2 Panel** | `https://sub.yourdomain.com/hy2/` | `admin123` (သို့မဟုတ် သင်သတ်မှတ်ထားသော Pass) |
| **AmneziaWG 2.0 Panel** | `https://sub.yourdomain.com/awg/` | သင်သတ်မှတ်ခဲ့သော `AWG_PASSWORD` |

---

## 🧪 အသုံးဝင်သော စစ်ဆေးရေး Commands များ (Useful Commands)

* **AmneziaWG Container Status စစ်ဆေးရန်**:
```bash
sudo docker ps | grep amnezia-wg-easy
sudo docker logs -f amnezia-wg-easy
```

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

* **Nginx Configuration စစ်ဆေးပြီး Restart ချရန်**:
```bash
sudo nginx -t && sudo systemctl reload nginx
```
