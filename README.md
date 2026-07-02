# Unified Subscription Panel (Outline, Hysteria2 & 3x-ui)

A modern, high-performance, and feature-rich unified web panel to manage **Outline**, **Hysteria2**, and **3x-ui** (Xray/V2ray) VPN servers. Issue a single universal subscription link for your users, and control their access, expiry, and track live data usage across multiple servers from a single dashboard.

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
   * `ADMIN_USERNAME`: Dashboard Login Username.
   * `ADMIN_PASSWORD`: Dashboard Login Password.
   * `AUTH_SECRET`: A long random string for cookie/session encryption.
   * `CRON_SECRET`: A long secure password for authorizing Cron Jobs (e.g., `my-super-secret-cron-2026`).
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
---

## 🇲🇲 မြန်မာဘာသာ လမ်းညွှန်

Outline, Hysteria2 နှင့် 3x-ui (Xray/V2ray) ဆာဗာ သုံးမျိုးစလုံးကို နေရာတစ်တည်းကနေ ထိန်းချုပ်လို့ရမယ့် ခေတ်မီ Subscription Web Panel တစ်ခု ဖြစ်ပါတယ်။ အသုံးပြုသူ (Client) တွေအတွက် Sub Link တစ်ခုတည်း ပေးရုံနဲ့ ဆာဗာအားလုံးရဲ့ Key တွေကို အလွယ်တကူ ရယူအသုံးပြုနိုင်မှာပါ။

### 🌟 ထူးခြားကောင်းမွန်သော လုပ်ဆောင်ချက်များ
* **စနစ်စုံသုံးနိုင်ခြင်း**: Outline, Hysteria2 နှင့် 3x-ui ဆာဗာအားလုံးကို မျက်နှာပြင်တစ်ခုတည်းတွင် ပေါင်းစည်းစီမံနိုင်ခြင်း။
* **Sub Link မပျက်စီးစေသော စနစ်**:
  * ဆာဗာတစ်ခုခု ပျက်နေလျှင် (ဥပမာ 3x-ui server down ဖြစ်နေလျှင်) subscription link တောင်းခံမှု မကျဆင်းသွားစေရန် `5s timeout` သတ်မှတ်ထားပြီး အခြားအလုပ်လုပ်သော ဆာဗာများကိုသာ အလိုအလျောက် ရွေးချယ်ပေးပို့ပေးခြင်း။
  * အကောင့်ပိတ်ထားသူ သို့မဟုတ် သက်တမ်းကုန်သွားသူများအား HTTP 200 OK ပြန်ပေးပြီး dummy proxy node (ဥပမာ `🚫 Account Suspended` သို့မဟုတ် `❌ Subscription Expired`) ကိုသာ ပြသပေးခြင်းဖြင့် client app များမှ sub link ဖျက်ပစ်ခြင်းကို ကာကွယ်ပေးခြင်း။
* **အဆင့်မြင့်လုံခြုံရေးစနစ် (RLS + Service Role Key)**:
  * Supabase tables များအားလုံးတွင် RLS (Row Level Security) ဖွင့်ထားပြီး ပြင်ပမှ anonymous data တိုက်ရိုက်ခိုးယူခြင်းကို လုံးဝကာကွယ်ထားခြင်း။
  * Web backend (server-side) တွင် `SUPABASE_SERVICE_ROLE_KEY` ကိုအသုံးပြု၍ RLS ကိုကျော်ကာ သတ်မှတ်ခွင့်ရှိသူသာ ဒေတာဖတ်/ရေး လုပ်ဆောင်စေခြင်း။
* **ခိုင်မာသော Cron Auth စနစ်**: Cron endpoints အားလုံးသို့ `/api/cron/*` လှမ်းခေါ်ရာတွင် `Authorization: Bearer <CRON_SECRET>` header ပါမှသာ လုပ်ဆောင်ခွင့်ပြုခြင်း။
* **VPS Crontab နှင့် ချိတ်ဆက်အသုံးပြုနိုင်ခြင်း**: Vercel Free Plan တွင် အချိန်တို cron မရသော ပြဿနာအား မိမိ၏ Linux VPS crontab မှ curl ဖြင့် အချိန်ကိုက် လှမ်းခေါ်ခိုင်းပြီး အခမဲ့ဖြေရှင်းနိုင်ခြင်း။
* **ပွတ်သပ်ထားသော UI/UX**: browser alert/confirm Dialogue ဘောက်စ်များအစား client list ထဲတွင် အလိုအလျောက် သက်ဝင်လှုပ်ရှားမည့် custom inline confirm row ကို ပြောင်းလဲအသုံးပြုထားခြင်း။

---

### 🚀 တည်ဆောက်ခြင်းနှင့် အသုံးပြုခြင်း လမ်းညွှန်

#### ၁။ Supabase Database ပြင်ဆင်ခြင်း
[Supabase](https://supabase.com) တွင် အကောင့်ဖွင့်ပြီး project အသစ်ဆောက်ပါ။ **SQL Editor** သို့သွားပြီး အောက်ပါ SQL commands များကို Run ပေးပါ:

*(အထက်ဖော်ပြပါ English Documentation ရှိ SQL Schema အတိုင်း Supabase Database တွင် ထည့်သွင်းပါ)*

#### ၂။ Supabase Table များအား RLS ဖွင့်ပါ
Supabase database ထဲရှိ Table Editor သို့သွားပြီး table တစ်ခုချင်းစီ (`clients`, `servers`, `client_keys`, `settings`) ၏ ညာဘက်အပေါ်ထောင့်ရှိ **RLS Disabled** ကို နှိပ်ပြီး **Enable RLS** ပြုလုပ်ပေးပါ။

#### ၃။ Vercel ပေါ်သို့ တင်ခြင်း
1. သင်၏ GitHub repository အား Vercel သို့ Import လုပ်ပါ။
2. **Environment Variables** တွင် အောက်ပါတို့ကို ထည့်ပါ:
   * `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon public key
   * `SUPABASE_SERVICE_ROLE_KEY`: Supabase service_role key (Project Settings > API မှ ယူပါ)
   * `ADMIN_USERNAME`: Admin Panel ဝင်ရန် နာမည်
   * `ADMIN_PASSWORD`: Admin Panel ဝင်ရန် လျှို့ဝှက်နံပါတ်
   * `AUTH_SECRET`: လျှို့ဝှက်စာလုံးရှည်တစ်ခု
   * `CRON_SECRET`: Cron job ခေါ်ယူခွင့်ပြုရန် သတ်မှတ်ထားသော လျှို့ဝှက်စကားစု (ဥပမာ `my-super-secret-cron-2026`)
3. **Deploy** လုပ်ပါ။

---

### ⚙️ VPS Crontab တွင် Cron job များ သတ်မှတ်ခြင်း (အကြံပြုချက်)
Vercel Free plan တွင် ဒေတာပုံမှန် sync လုပ်ရန် VPS Linux server ၏ Crontab ကို အသုံးပြုရပါမည်။

1. သင့် VPS ဆာဗာထဲသို့ SSH ဝင်ပါ။
2. `crontab -e` ဟု ရိုက်နှိပ်ပါ။
3. ဖိုင်၏ အောက်ဆုံးတွင် အောက်ပါစာကြောင်းများကို ကူးယူထည့်သွင်းပါ (`my-super-secret-cron-2026` နေရာတွင် သင်၏ Vercel `CRON_SECRET` တန်ဖိုးအား အစားထိုးပါ):
   ```bash
   # ၁၀ မိနစ်တစ်ကြိမ် ဒေတာအသုံးပြုမှု sync လုပ်ရန်
   */10 * * * * curl -s -H "Authorization: Bearer my-super-secret-cron-2026" "https://your-app.vercel.app/api/cron/sync-usage" > /dev/null

   # နေ့စဉ် ည ၁၂:၀၀ တွင် သက်တမ်းကုန်ဆုံးသူများကို စစ်ဆေးပိတ်ချရန်
   0 0 * * * curl -s -H "Authorization: Bearer my-super-secret-cron-2026" "https://your-app.vercel.app/api/cron/check-expiry" > /dev/null

   # နေ့စဉ် ညဉ့်နက် ၃:၀၀ တွင် Database အား WebDAV သို့ Backup တင်ရန်
   0 3 * * * curl -s -H "Authorization: Bearer my-super-secret-cron-2026" "https://your-app.vercel.app/api/cron/auto-backup" > /dev/null
   ```
4. ဖိုင်အား Save လုပ်ပြီး ထွက်ပါ။ (`Ctrl+O` -> `Enter` -> `Ctrl+X`)

---

### ☁️ Cloud Auto Backup ထည့်သွင်းနည်း (WebDAV / Koofr)
1. [Koofr](https://koofr.eu) တွင် အကောင့်ဖွင့်ပြီး **Preferences > Password > App Passwords** တွင် Password အသစ်တစ်ခုထုတ်ယူပါ။
2. သင့် Panel ၏ **Settings > Backup & Restore** တွင် ဖြည့်ပါ:
   * **URL**: `https://app.koofr.net/dav/Koofr` (Folder သီးသန့်ခွဲလိုပါက အဆုံးတွင် `/FolderName` ဟု ရေးပါ)
   * **Username**: Koofr အကောင့် email
   * **Password**: Koofr မှ ထုတ်ပေးလိုက်သော App Password
3. **Enable Daily Auto Backup** အား ဖွင့်ပြီး သိမ်းဆည်းပါ။
