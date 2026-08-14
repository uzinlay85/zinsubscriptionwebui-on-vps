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

## 🚀 တပ်ဆင်နည်း အပြည့်အစုံ (Complete Setup Guide)

### နည်းလမ်း (၁) - 1-Click Automated Setup (အလွယ်ကူဆုံး နည်းလမ်း)

သင့် VPS ရဲ့ Terminal / SSH ထဲသို့ ဝင်ရောက်ပြီး အောက်ပါ Command ကို ရိုက်ထည့်ပါ-

```bash
curl -fsSL https://raw.githubusercontent.com/uzinlay85/zinsubscriptionwebui-on-vps/main/python-sub-panel/setup.sh -o setup.sh && bash setup.sh
```

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

## 🖥️ ဆာဗာများ ထည့်သွင်းနည်း လမ်းညွှန် (Adding Servers)

Panel ရှိ **Servers** စာမျက်နှာ -> **`+ Add Server`** ကို နှိပ်ပါ။

---

### 🔵 1. Outline Server ထည့်သွင်းနည်း

| Field | ယူရမည့်နေရာ / ရှင်းလင်းချက် |
|---|---|
| **Server Name** | မိမိစိတ်ကြိုက် အမည် (ဥပမာ- `SG-Outline`) |
| **API URL** | Outline VPS ထဲတွင် `cat /opt/outline/access.txt` ရိုက်ပြီး `apiUrl` ကို ကူးယူပါ |
| **Cert SHA-256** | `access.txt` ထဲရှိ `certSha256` တန်ဖိုးကို ကူးယူပါ |

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
```

---

## 📄 License
MIT License - တည်ဆောက်သူ **Zin** မှ အခမဲ့ မျှဝေထားပါသည်။
