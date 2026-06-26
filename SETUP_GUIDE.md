# Outline Subscription Panel Setup Guide

ဒီ Project ကို စတင်ဖို့အတွက် Database အနေနဲ့ Supabase ကို သုံးမှာဖြစ်လို့ သင့်အနေနဲ့ [Supabase.com](https://supabase.com) မှာ Project အသစ်တစ်ခု အရင်ဆုံး ဖွင့်ပေးပါ။

## ၁။ SQL Editor တွင် Run ရမည့် Code
Project ဖွင့်ပြီးပါက ဘယ်ဘက်က **SQL Editor** ဆိုတာကို နှိပ်ပြီး အောက်ပါ Code များကို အတိအကျ ကူးထည့်ကာ **Run** ကို နှိပ်ပါ-

```sql
-- Create Servers Table
CREATE TABLE servers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  cert_sha256 TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Clients Table
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sub_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL, -- Subscription link အတွက်
  status TEXT DEFAULT 'active' NOT NULL,
  expiry_date TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Client_Keys Table (Client များနှင့် Server များကို ချိတ်ဆက်ပေးရန်)
CREATE TABLE client_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  outline_key_id TEXT NOT NULL, -- Outline ဆာဗာပေါ်က key ID (ဥပမာ 0, 1, 2)
  access_url TEXT NOT NULL, -- ss://... စသည့် Key အပြည့်အစုံ
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

## ၂။ API Keys များ ထုတ်ယူခြင်း
Run ပြီးပါက ဘယ်ဘက်အောက်ထောင့်ရှိ **Project Settings (ဂီယာပုံ) > API** သို့ သွားပါ။
ထိုနေရာမှ အောက်ပါ အချက် (၂) ချက်ကို Copy ကူးထားပါ-
1. **Project URL**
2. **Project API Keys (anon / public)**

## ၃။ Environment Variables ထည့်သွင်းခြင်း
သင်ကူးယူထားသော `URL` နှင့် `anon key` ကို လက်ရှိ Folder အောက်တွင်ရှိသော `.env.local` ဖိုင်ထဲတွင် သွားရောက် အစားထိုး ထည့်သွင်းပေးပါ။
(အကယ်၍ ဖိုင်မရှိပါက `.env.local.example` ကို `.env.local` ဟု နာမည်ပြောင်းပြီး အသုံးပြုနိုင်ပါသည်)

## ၄။ ပြီးစီးကြောင်း အသိပေးပါ
အားလုံး ပြီးသွားပြီဆိုလျှင် ချက်ဘောက်စ်တွင် **"Database တည်ဆောက်ပြီးပါပြီ"** ဟု စာပြန်ပေးပါ ခင်ဗျာ။ ဒါဆိုရင် နောက်ထပ် Dashboard Code တွေကို ဆက်လက် ရေးသားသွားပါမည်။
