# Outline, Hysteria2 & 3x-ui Unified Subscription Panel

A modern, fast, and feature-rich unified web panel to manage Outline, Hysteria2, and 3x-ui (Xray/V2ray) VPN servers. This project allows you to issue a single universal subscription link for your users, and control their access, expiry, and track live data usage across multiple servers from a single dashboard.

မြန်မာဘာသာဖြင့် ဖတ်ရှုရန် အောက်သို့ ဆင်းပါ။ 

---

## 🇺🇸 English Documentation

### 🌟 Features
- 🚀 **Multi-Protocol Support**: Seamlessly manage **Outline**, **Hysteria2**, and **3x-ui** servers from a single dashboard.
- 🔗 **Universal Subscription Links**: Generate a single subscription link (`/api/sub/[token]`) per client that serves both Sing-box JSON and Base64 (V2ray/Clash) formats automatically based on the user-agent.
- ⏳ **Expiry Management & Auto-Suspension**: Set expiry dates for clients. A daily cron job automatically disables expired clients across all connected servers.
  - *Note: Modern apps show remaining days natively via `Subscription-Userinfo` HTTP Headers and a fallback dummy proxy node.*
- 📊 **Live Data Usage Tracking**: Monitor real-time data consumption directly from Outline and Hysteria2 server metrics.
- 🔄 **Smart Key Synchronization**: A "Sync Keys" button to automatically deploy missing client keys across all servers with a single click.
- ☁️ **Advanced Backup System**:
  - **Local Backup**: Export and Import the entire Supabase database as a JSON file.
  - **Cloud Auto-Backup**: Daily automated backups to WebDAV services (like Koofr or Nextcloud) ensuring your data is never lost.
- 👥 **Bulk Client Creation**: Generate up to 50 clients at once using a base name (e.g., `vip-1, vip-2`) and copy all their subscription links instantly.
- 🌍 **Auto GeoIP Flags**: Automatically detects the server's IP location during setup and prepends the country flag emoji (e.g. 🇸🇬) to the server name.

### 📋 Prerequisites
1. **Supabase Account**: For the PostgreSQL database.
2. **Vercel Account**: For free hosting and serverless functions.
3. **Outline Server**: Must have the Management API URL and Cert SHA-256. 
   - *Tip: SSH into your Outline VPS and run `cat /opt/outline/access.txt` to find these details.*
4. **Hysteria2 Server**: Must be running the Hysteria2 Express Backend Admin API.
5. **3x-ui Server**: Must have an active 3x-ui panel running (v3.0+ with CSRF protection is fully supported).

### 🌍 How to Add Servers to the Panel

### 1. Outline Server
To connect an Outline server, you need the API URL and Certificate SHA-256. You can find these on your Outline VPS by running:
```bash
cat /opt/outline/access.txt
```
Copy the values and fill them in the "Add Server" form:
- **Server Name**: Any name you want (e.g. `Singapore Premium`). *Note: The panel will auto-detect the IP and add a country flag for you!*
- **API URL**: Paste the `apiUrl` here (e.g. `https://123.45.67.89:4490/secret_token`).
- **Cert SHA-256**: Paste the `certSha256` here.

### 2. Hysteria2 Server
To connect a Hysteria2 server, you must have the **Express Admin API** installed on your server alongside Hysteria2.
- **Server Name**: Any name you want.
- **API URL**: The URL of your Express API (e.g. `http://123.45.67.89:3000`).
- **Admin User**: The `ADMIN_USERNAME` you set in the Express API `.env` file.
- **Admin Pass**: The `ADMIN_PASSWORD` you set in the Express API `.env` file.

### 3. 3x-ui Server (Xray/V2ray)
Seamlessly integrate 3x-ui panels. Note: The panel securely fetches the CSRF tokens required by newer 3x-ui (v3.0+) panels automatically.
- **Server Name**: Any name you want.
- **3x-ui Panel URL**: To completely bypass Cloudflare WAF Bot Protection, it is highly recommended to use your direct VPS IP and Panel Port instead of your domain (e.g., `http://64.120.95.204:2053/panel_path`). 
- **Panel Username & Password**: Your 3x-ui login credentials.
- **Inbound ID**: The specific inbound ID (e.g., `1`) where new clients should be added.

### 🛠️ Troubleshooting 3x-ui
- **Cloudflare 403 Forbidden**: If your panel is behind Cloudflare, standard API requests might be blocked by Cloudflare Bot Protection. To resolve this, always use your direct VPS IP and port (e.g. `http://64.120.95.204:2053`) instead of the domain name when adding the server to this panel.
- **MHSanaei v3.x API Changes**: Recent versions of the MHSanaei 3x-ui panel have deprecated `inbounds/addClient` and replaced it with `clients/add`. This panel automatically handles this new payload structure, but ensure you are running a supported v3+ version.
- **Missing CSRF Tokens**: This panel handles CSRF tokens automatically by fetching the token from the root `/` page before logging in. If login fails, ensure your panel does not have additional custom authentication layers.

---

## 🚀 Installation & Deployment

#### 1. Setup Supabase Database
1. Create a new project on [Supabase](https://supabase.com).
2. Go to the **SQL Editor** and run the following script:

```sql
-- Create Servers Table
CREATE TABLE servers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  cert_sha256 TEXT NOT NULL,
  auth_username TEXT,
  auth_password TEXT,
  inbound_id INTEGER, -- For 3x-ui support
  type TEXT DEFAULT 'outline' NOT NULL, -- 'outline', 'hysteria2', or '3x-ui'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE servers DISABLE ROW LEVEL SECURITY;

-- Create Clients Table
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sub_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL,
  expiry_date TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;

-- Create Client_Keys Table
CREATE TABLE client_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  outline_key_id TEXT NOT NULL,
  access_url TEXT NOT NULL,
  uuid TEXT, -- For 3x-ui clients
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE client_keys DISABLE ROW LEVEL SECURITY;

-- Create Settings Table (For WebDAV & General Settings)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
```

#### 2. Deploy to Vercel
1. Push this repository to your GitHub account.
2. Import the repository into Vercel.
3. In the **Environment Variables** section, add the following:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon public key
   - `ADMIN_USERNAME`: Username to login to this dashboard (e.g., `admin`)
   - `ADMIN_PASSWORD`: Password to login to this dashboard
   - `AUTH_SECRET`: A random long string for session encryption
4. Deploy!

### ⚠️ Important Notes
- **Vercel Cron Limit**: The automatic Outline key blocking feature uses Vercel Cron (`vercel.json`). On Vercel's free **Hobby plan**, cron jobs can only run **once per day**. Expiry enforcement will happen daily.
- **Hysteria2 Backend**: Your Hysteria2 servers must be running the matching Express Admin API for this panel to communicate with them.

### ☁️ Cloud Backup Setup (WebDAV / Koofr)
The panel supports daily automated database backups to WebDAV services like Koofr or Nextcloud.
1. Create a free account on [Koofr](https://koofr.eu).
2. Go to Koofr **Preferences > Password > App Passwords** and generate a new password (e.g., name it "Outline Panel").
3. In your panel's **Settings > Backup & Restore**:
   - **URL**: `https://app.koofr.net/dav/Koofr` (Add `/FolderName` at the end if you want to save to a specific folder).
   - **Username**: Your Koofr email address.
   - **Password**: The **App Password** you just generated.
4. Turn on **Enable Daily Auto Backup** and click **Save Settings**. 

---

## 🇲🇲 မြန်မာဘာသာ လမ်းညွှန်

Outline, Hysteria2 နှင့် 3x-ui (Xray/V2ray) ဆာဗာ သုံးမျိုးစလုံးကို နေရာတစ်တည်းကနေ ထိန်းချုပ်လို့ရမယ့် ခေတ်မီ Subscription Web Panel တစ်ခု ဖြစ်ပါတယ်။ အသုံးပြုသူ (Client) တွေအတွက် Sub Link တစ်ခုတည်း ပေးရုံနဲ့ ဆာဗာအားလုံးရဲ့ Key တွေကို အလွယ်တကူ ရယူအသုံးပြုနိုင်မှာပါ။

### 🌟 ပါဝင်သော လုပ်ဆောင်ချက်များ (Features)
- 🚀 **Multi-Protocol Support**: Outline, Hysteria2 နဲ့ 3x-ui ဆာဗာ အားလုံးကို Dashboard တစ်ခုတည်းမှာ ပေါင်းပြီး လွယ်ကူစွာ ထိန်းချုပ်နိုင်ခြင်း။
- 🔗 **Universal Subscription Links**: Client တစ်ယောက်ကို Sub Link (`/api/sub/...`) တစ်ခုတည်း ပေးရုံဖြင့် Sing-box JSON နှင့် Base64 (V2ray/Clash) Format များကို App ပေါ်မူတည်၍ အလိုအလျောက် ပြောင်းလဲထုတ်ပေးနိုင်ခြင်း။
- ⏳ **Expiry Management & Auto-Suspension (သက်တမ်းထိန်းချုပ်စနစ်)**: အသုံးပြုသူများကို သက်တမ်း ကန့်သတ်နိုင်ခြင်း။ နေ့စဉ်စစ်ဆေးပေးမည့် Cron Job မှ သက်တမ်းကုန်သွားသော Client များကို ဆာဗာအားလုံးတွင် အလိုအလျောက် ပိတ်ချပေးပါမည်။
  - *မှတ်ချက်။ ။ ခေတ်မီ App များနှင့် ချိတ်ဆက်ပါက `Subscription-Userinfo` မှတစ်ဆင့် ကျန်ရှိသော ရက်အရေအတွက်ကို App မျက်နှာပြင်တွင် တိုက်ရိုက် ပြသပေးပါမည်။*
- 📊 **Live Data Usage Tracking**: ဆာဗာတွေဆီကနေ Data သုံးစွဲမှု (Usage) ပမာဏကို Dashboard တွင် တိုက်ရိုက် ကြည့်ရှုနိုင်ခြင်း။
- 🔄 **Smart Key Synchronization**: "Sync Keys" ခလုတ် တစ်ချက်နှိပ်ရုံဖြင့် Client တစ်ယောက်အတွက် လိုအပ်နေသော ဆာဗာများတွင် Key များကို အလိုအလျောက် အသစ်ဖန်တီး ထည့်သွင်းပေးခြင်း။
- ☁️ **Advanced Backup System**:
  - **Local Backup**: Database တစ်ခုလုံးကို JSON ဖိုင်အဖြစ် Download (Export) ရယူနိုင်ပြီး၊ ပြန်လည် ထည့်သွင်း (Import) နိုင်ခြင်း။
  - **Cloud Auto-Backup**: နေ့စဉ် ညဘက်တိုင်း Koofr သို့မဟုတ် Nextcloud ကဲ့သို့ WebDAV စနစ်များသို့ အလိုအလျောက် Auto Backup တင်ပေးခြင်းကြောင့် Data ပျောက်ဆုံးမည်ကို ပူစရာမလိုခြင်း။
- 👥 **Bulk Client Creation**: `vip` စသော နာမည်တစ်ခု ပေးရုံဖြင့် `vip-1, vip-2` စသည်ဖြင့် Client အယောက် ၅၀ အထိ တစ်ပြိုင်နက် ဖန်တီးပေးနိုင်ပြီး၊ ၎င်းတို့၏ Link အားလုံးကို "Copy All Links" ခလုတ်ဖြင့် တစ်ချက်တည်း Copy ယူနိုင်ခြင်း။
- 🌍 **Auto GeoIP Flags**: ဆာဗာအသစ် ထည့်သွင်းချိန်တွင် IP ကိုဖတ်၍ နိုင်ငံကို အလိုအလျောက်ရှာဖွေပေးကာ၊ ဆာဗာနာမည်ရှေ့တွင် နိုင်ငံအလံလေးများ (ဥပမာ - 🇸🇬) တပ်ပေးသည့်စနစ် ပါဝင်ခြင်း။

### 📋 လိုအပ်ချက်များ (Prerequisites)
1. **Supabase Account**: Database အတွက် [Supabase](https://supabase.com) တွင် အကောင့်ရှိရပါမည်။
2. **Vercel Account**: Web Panel ကို အခမဲ့ တင်ရန် (Hosting) [Vercel](https://vercel.com) အကောင့်ရှိရပါမည်။
3. **Servers**: Outline နှင့် Hysteria2 ကို ချိတ်ဆက်ရန် အောက်ပါတို့ကို ပြင်ဆင်ထားရပါမည်။
   - **Outline**: VPS သို့ ဝင်ပြီး `cat /opt/outline/access.txt` ဟု ရိုက်ထည့်ကာ `apiUrl` နှင့် `certSha256` ကို ကူးယူထားပါ။
   - **Hysteria2**: ဆာဗာဘက်တွင် Express Backend API ကို အသင့် Run ထားရပါမည်။
   - **3x-ui**: လည်ပတ်နေသော 3x-ui Panel တစ်ခုရှိရပါမည်။ (v3.0 အထက် CSRF Token ပါဝင်သော version များကိုလည်း အပြည့်အဝ ထောက်ပံ့ပေးထားပါသည်)

### 🌍 Panel သို့ ဆာဗာများ ထည့်သွင်းချိတ်ဆက်နည်း

### ၁။ Outline ဆာဗာ ထည့်နည်း
Outline ဆာဗာကို ချိတ်ဆက်ရန်အတွက် API URL နှင့် Certificate SHA-256 တို့ လိုအပ်ပါသည်။ သင်၏ Outline VPS အတွင်းသို့ ဝင်၍ အောက်ပါ command ကို ရိုက်ထည့်ပါ -
```bash
cat /opt/outline/access.txt
```
ထိုအခါ ကျလာသော စာကြောင်းများထဲမှ တန်ဖိုးများကို ယူ၍ Panel ၏ "Add Server" တွင် ဖြည့်ပါ -
- **Server Name**: မိမိကြိုက်နှစ်သက်ရာ နာမည်ပေးနိုင်ပါသည်။ (မှတ်ချက် - ဆာဗာ၏ IP ကိုကြည့်၍ နိုင်ငံအလံကို အလိုအလျောက် တပ်ပေးသွားမည် ဖြစ်သည်!)
- **API URL**: `apiUrl` ကို ကူးထည့်ပါ (ဥပမာ - `https://123.45.67.89:4490/secret_token`)။
- **Cert SHA-256**: `certSha256` ကို ကူးထည့်ပါ။

### ၂။ Hysteria2 ဆာဗာ ထည့်နည်း
Hysteria2 ဆာဗာကို ချိတ်ဆက်ရန်အတွက် သင်၏ ဆာဗာတွင် Hysteria2 အပြင် **Express Admin API** ကိုပါ ထည့်သွင်းထားရန် လိုအပ်ပါသည်။
- **Server Name**: မိမိကြိုက်နှစ်သက်ရာ နာမည်ပေးပါ။
- **API URL**: သင်၏ Express API လင့်ခ်ကို ထည့်ပါ (ဥပမာ - `http://123.45.67.89:3000`)။
- **Admin User**: Express API ၏ `.env` ထဲတွင် ပေးခဲ့သော `ADMIN_USERNAME` ကို ထည့်ပါ။
- **Admin Pass**: Express API ၏ `.env` ထဲတွင် ပေးခဲ့သော `ADMIN_PASSWORD` ကို ထည့်ပါ။

### ၃။ 3x-ui ဆာဗာ ထည့်နည်း (Xray/V2ray)
3x-ui ဆာဗာများကို လွယ်ကူစွာ ချိတ်ဆက်နိုင်ပါသည်။ 
- **Server Name**: မိမိကြိုက်နှစ်သက်ရာ နာမည်ပေးပါ။
- **3x-ui Panel URL**: Vercel ကနေ လှမ်းချိတ်သည့်အခါ Cloudflare ရဲ့ WAF Bot Protection အပိတ်ခံရခြင်းမှ ကင်းဝေးစေရန် Domain အစား **VPS ၏ IP Address နှင့် Panel Port ကိုသာ တိုက်ရိုက် အသုံးပြုရန်** အထူး အကြံပြုအပ်ပါသည်။ (ဥပမာ - `http://64.120.95.204:2053/panel_path`)
- **Panel Username & Password**: 3x-ui Panel ဝင်သည့် အကောင့်များ။
- **Inbound ID**: Client အသစ်များ ထည့်သွင်းလိုသော 3x-ui အတွင်းရှိ Inbound ID နံပါတ် (ဥပမာ - `1`)

### 🛠️ 3x-ui ပြဿနာများ ဖြေရှင်းနည်း (Troubleshooting)
- **Cloudflare 403 Error တက်ခြင်း**: Panel ကို Cloudflare ခံထားပါက၊ API လှမ်းခေါ်ရာတွင် Cloudflare Bot Protection ဖြင့် အပိတ်ခံရတတ်ပါသည်။ ထို့ကြောင့် Server အသစ်ထည့်ချိန်တွင် Domain Name အစား မိမိ၏ **VPS IP Address နှင့် Port အစစ်** ကိုသာ ထည့်သွင်းအသုံးပြုပါ။ (ဥပမာ - `http://64.120.95.204:2053`)
- **MHSanaei v3.x လမ်းကြောင်း ပြောင်းလဲခြင်း**: MHSanaei 3x-ui အသစ်များတွင် `inbounds/addClient` အစား `clients/add` လမ်းကြောင်းကို ပြောင်းလဲအသုံးပြုထားပါသည်။ ဤ Panel က အဆိုပါ လမ်းကြောင်းအသစ်ကိုပါ အပြည့်အဝ Support လုပ်ပေးထားပါသည်။
- **CSRF Token အခက်အခဲ**: Login ဝင်ရာတွင် လိုအပ်သော CSRF Token များကို ဤ Panel မှ အလိုအလျောက် ယူဆောင်ပေးပါသည်။ အကယ်၍ Login ဝင်မရပါက 3x-ui ဘက်တွင် အခြား Custom လုံခြုံရေးများ ခံထားခြင်း ရှိမရှိ စစ်ဆေးပါ။

---

## 🚀 ထည့်သွင်းနည်း လမ်းညွှန် (Vercel ဖြင့် အခမဲ့တင်နည်း) (Installation & Deployment)

#### ၁။ Supabase Database တည်ဆောက်ခြင်း
1. [Supabase](https://supabase.com) တွင် Project အသစ်တစ်ခု ဖန်တီးပါ။
2. ဘယ်ဘက်မှ **SQL Editor** သို့သွားပြီး အောက်ပါ SQL ကုဒ်များကို ကူးထည့်ကာ **Run** နှိပ်ပေးပါ။

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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE servers DISABLE ROW LEVEL SECURITY;

-- Create Clients Table
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sub_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL,
  expiry_date TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;

-- Create Client_Keys Table
CREATE TABLE client_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  outline_key_id TEXT NOT NULL,
  access_url TEXT NOT NULL,
  uuid TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE client_keys DISABLE ROW LEVEL SECURITY;

-- Create Settings Table (For WebDAV & General Settings)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
```

#### ၂။ Vercel ပေါ်သို့ တင်ခြင်း (Deployment)
1. ဤ Repository ကို မိမိ၏ GitHub အကောင့်ထဲသို့ Push လုပ်ပါ။
2. Vercel ထဲသို့ ဝင်ပြီး ထို Repository ကို **Import** လုပ်ပါ။
3. Build မလုပ်ခင် **Environment Variables** နေရာတွင် အောက်ပါတို့ကို ဖြည့်ပေးပါ-
   - `NEXT_PUBLIC_SUPABASE_URL` (Supabase Project Settings > API မှ ယူပါ)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase မှ `anon public` Key ကို ယူပါ)
   - `ADMIN_USERNAME`: Admin Panel သို့ ဝင်ရန် မိမိထားလိုသော Username (ဥပမာ - `admin`)
   - `ADMIN_PASSWORD`: Admin Panel သို့ ဝင်ရန် မိမိထားလိုသော Password
   - `AUTH_SECRET`: လုံခြုံရေးအတွက် မိမိစိတ်ကြိုက် အင်္ဂလိပ်စာလုံး ရှည်ရှည်တစ်ခု (ဥပမာ - `my_super_secret_key_123`)
4. **Deploy** ကို နှိပ်လိုက်ပါက အသင့် အသုံးပြုနိုင်ပါပြီ။

### ⚠️ အရေးကြီးသော အသိပေးချက် (Important Notes)
- **Vercel Cron Limit**: Outline Key များကို သက်တမ်းစစ်ဆေးပြီး အလိုအလျောက် ပိတ်ပေးမည့်စနစ် (Cron Job) သည် Vercel ၏ Free (Hobby) Plan အရ **တစ်နေ့လျှင် (၁) ကြိမ်သာ** အလုပ်လုပ်ပါမည်။ (တစ်ရက်လျှင် တစ်ကြိမ် ပုံမှန် စစ်ဆေးပိတ်ချပေးသွားမည် ဖြစ်သည်။)
- **Hysteria2 API**: Hysteria2 ကို ဤ Panel နှင့် ချိတ်ဆက်အသုံးပြုရန်အတွက် ဆာဗာတွင် Express Backend API ကို သွင်းထားရန် လိုအပ်ပါသည်။

### ☁️ Cloud Auto Backup ထည့်သွင်းနည်း (WebDAV / Koofr)
Database တစ်ခုလုံးကို Cloud ပေါ်သို့ နေ့စဉ် အလိုအလျောက် သိမ်းဆည်းပေးမည့် (Auto Backup) စနစ်ကို WebDAV အသုံးပြု၍ ပြုလုပ်နိုင်ပါသည်။
1. [Koofr](https://koofr.eu) တွင် အခမဲ့ အကောင့်တစ်ခု ဖွင့်ပါ။
2. Koofr ၏ **Preferences > Password > App Passwords** သို့သွားကာ Password အသစ်တစ်ခု ထုတ်ယူပါ (ဥပမာ "Outline Panel" ဟု နာမည်ပေးပါ)။
3. သင်၏ Panel ရှိ **Settings > Backup & Restore** သို့သွားပြီး-
   - **URL**: `https://app.koofr.net/dav/Koofr` (Folder သီးသန့်ခွဲထားလိုပါက နောက်တွင် `/FolderName` ထည့်ပေးပါ)။
   - **Username**: သင်၏ Koofr အကောင့် (Email)
   - **Password**: ခုနက အသစ်ထုတ်ထားသော **App Password** 
4. **Enable Daily Auto Backup** ကို ဖွင့်ပြီး **Save Settings** နှိပ်လိုက်ပါ။ နေ့စဉ် ညဘက်တိုင်း အလိုအလျောက် သိမ်းပေးသွားပါမည်။
