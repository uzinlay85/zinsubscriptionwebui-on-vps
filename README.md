# Outline & Hysteria2 Unified Subscription Panel

A modern, fast, and feature-rich unified web panel to manage both Outline and Hysteria2 VPN servers. This project allows you to issue a single universal subscription link for your users, and control their access, expiry, and track live data usage across multiple servers from a single dashboard.

မြန်မာဘာသာဖြင့် ဖတ်ရှုရန် အောက်သို့ ဆင်းပါ။ 

---

## 🇺🇸 English Documentation

### 🌟 Features
- **Unified Management**: Control both Outline and Hysteria2 servers in one place.
- **Universal Subscription Link**: Clients get a single link (`/api/sub/[token]`) that automatically serves all their assigned keys in standard base64 format (compatible with v2rayN, Nekobox, Shadowrocket, etc.).
- **Live Data Usage**: Automatically fetches and aggregates live data transfer metrics from your servers.
- **Expiry Control**: Set expiry dates for users. 
  - Sublinks stop working immediately upon expiry.
  - Hysteria2 users are automatically disabled on the backend.
  - Outline users are blocked automatically via a Vercel Cron Job (sets data limit to 1 byte).
  - Modern clients show remaining days natively via `Subscription-Userinfo` HTTP Headers and a fallback dummy proxy node at the top of the server list.
- **Sync Keys**: Click a single button to automatically generate missing access keys across all servers for a user.
- **Modern UI**: Built with Next.js 14 App Router, TailwindCSS, and Lucide Icons for a premium dark mode aesthetic.

### 📋 Prerequisites
1. **Supabase Account**: For the PostgreSQL database.
2. **Vercel Account**: For free hosting and serverless functions.
3. **Outline Server**: Must have the Management API URL (with trailing `/` or proper endpoint).
4. **Hysteria2 Server**: Must be running the Hysteria2 Express Backend Admin API.

### 🚀 Installation & Deployment

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
  auth_username TEXT, -- Hysteria2 admin username (optional for Outline)
  auth_password TEXT, -- Hysteria2 admin password (optional for Outline)
  type TEXT DEFAULT 'outline' NOT NULL, -- 'outline' or 'hysteria2'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Clients Table
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sub_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL,
  expiry_date TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Client_Keys Table
CREATE TABLE client_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  outline_key_id TEXT NOT NULL,
  access_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
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

---

## 🇲🇲 မြန်မာဘာသာ လမ်းညွှန်

Outline နှင့် Hysteria2 ဆာဗာ နှစ်မျိုးစလုံးကို နေရာတစ်တည်းကနေ ထိန်းချုပ်လို့ရမယ့် ခေတ်မီ Subscription Web Panel တစ်ခု ဖြစ်ပါတယ်။ အသုံးပြုသူ (Client) တွေအတွက် Sub Link တစ်ခုတည်း ပေးရုံနဲ့ ဆာဗာအားလုံးရဲ့ Key တွေကို အလွယ်တကူ ရယူအသုံးပြုနိုင်မှာပါ။

### 🌟 ပါဝင်သော လုပ်ဆောင်ချက်များ (Features)
- **Unified Management**: Outline နဲ့ Hysteria2 ဆာဗာ နှစ်မျိုးစလုံးကို Dashboard တစ်ခုတည်းမှာ ပေါင်းပြီး ထိန်းချုပ်နိုင်ခြင်း။
- **Universal Subscription Link**: Client တစ်ယောက်ကို Sub Link (`/api/sub/...`) တစ်ခုတည်း ပေးရုံဖြင့် သူပိုင်ဆိုင်သော ဆာဗာအမျိုးအစားစုံမှ Key အားလုံးကို v2rayN, Nekobox စတဲ့ App တွေက အလိုအလျောက် ဆွဲယူပေးနိုင်ခြင်း။
- **Live Data Usage**: ဆာဗာတွေဆီကနေ Data သုံးစွဲမှု (Usage) ပမာဏကို Dashboard မှာ တိုက်ရိုက် ကြည့်ရှုနိုင်ခြင်း။
- **Expiry Control (သက်တမ်းထိန်းချုပ်စနစ်)**: အသုံးပြုသူများကို သက်တမ်း ကန့်သတ်နိုင်ခြင်း။
  - သက်တမ်းကုန်သွားပါက Sub Link ကြီးတစ်ခုလုံး အလိုအလျောက် ပိတ်သွားပါမည်။
  - Hysteria2 တွင် ဆာဗာဘက်မှ အလိုအလျောက် ကန်ထုတ်ပါမည်။
  - Outline တွင် Vercel Cron Job မှတစ်ဆင့် နေ့စဉ်စစ်ဆေးပြီး Data Limit ကို (1 Byte) အဖြစ် ပြောင်းလဲပိတ်ချပေးပါမည်။
  - App ထဲတွင် ကျန်ရှိသော ရက်အရေအတွက်ကို `Subscription-Userinfo` ဖြင့် သေသပ်စွာ ပြသပေးမည့်အပြင် Dummy Node အဖြစ်လည်း အလိုအလျောက် ပြသပေးပါမည်။
- **Sync Keys**: အသုံးပြုသူ တစ်ယောက်အတွက် ဆာဗာအားလုံးပေါ်မှာ Key တွေ ရှိမနေဘူးဆိုရင် ခလုတ်တစ်ချက်နှိပ်ရုံနဲ့ လိုအပ်တဲ့ Key တွေကို အလိုအလျောက် ဖန်တီးပေးခြင်း။
- **Modern UI**: Next.js App Router, TailwindCSS တို့ဖြင့် ရေးသားထားပြီး Dark Mode အပြည့်အဝ ပါဝင်သော လှပသည့် ဒီဇိုင်း။

### 📋 လိုအပ်ချက်များ (Prerequisites)
1. **Supabase Account**: Database အတွက် [Supabase](https://supabase.com) တွင် အကောင့်ရှိရပါမည်။
2. **Vercel Account**: Web Panel ကို အခမဲ့ တင်ရန် (Hosting) [Vercel](https://vercel.com) အကောင့်ရှိရပါမည်။
3. **Servers**: Outline API URL နှင့် Hysteria2 Backend API တို့ကို အသင့် ပြင်ဆင်ထားရပါမည်။

### 🚀 တပ်ဆင်ခြင်း နှင့် အသုံးပြုနည်း (Installation & Deployment)

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
  type TEXT DEFAULT 'outline' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Clients Table
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sub_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL,
  expiry_date TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Client_Keys Table
CREATE TABLE client_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  outline_key_id TEXT NOT NULL,
  access_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
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
