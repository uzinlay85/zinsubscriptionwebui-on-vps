# 🛡️ Web Application Security Rules (OWASP Top 10 2025)

ဤဖိုင်သည် Web Application များ ရေးသားရာတွင် ဖြစ်ပွားလေ့ရှိသည့် အန္တရာယ်အရှိဆုံး Security Vulnerabilities (အားနည်းချက်) ၁၀ ခုနှင့် ၎င်းတို့ကို ကာကွယ်တားဆီးရန် လိုက်နာရမည့် စည်းကမ်းချက်များအား စုစည်းထားသော Checklist ဖြစ်သည်။

> [!TIP]
> **အသုံးပြုနည်း:** သင် ရေးသားထားသော ကုဒ်များ သို့မဟုတ် Project ပြောင်းလဲမှုများကို စစ်ဆေးလိုပါက ကျွန်ုပ် (AI Assistant) အား **`"သတ်မှတ်ထားတဲ့ webappchecker-rule.md အတိုင်း ဒီ code ကို စစ်ဆေးပေးပါ"`** ဟု တိုက်ရိုက် ခိုင်းစေနိုင်ပါသည်ခင်ဗျာ။

---

## 📋 Security Checklist & Prevention Rules

### ၁။ Broken Access Control (အသုံးပြုခွင့် ကန့်သတ်ချက် ကျိုးပေါက်ခြင်း)
* **ပြဿနာ:** User တစ်ယောက်က မိမိမှာ လုပ်ပိုင်ခွင့်မရှိသည့် data သို့မဟုတ် လုပ်ဆောင်ချက်များကို ဝင်ရောက်လုပ်ဆောင်နိုင်ခြင်း။
* **ဥပမာ:** URL ရှိ ID အား `/invoice?id=123` မှ `/invoice?id=124` သို့ ပြောင်းလိုက်ရုံဖြင့် အခြားသူ၏ invoice အား မြင်တွေ့ရခြင်း (IDOR)။
* **စည်းကမ်းချက်များ:**
  - [ ] **Deny by Default:** API လမ်းကြောင်းများအား အလိုအလျောက် ပိတ်ထားပြီး ခွင့်ပြုချက်ရှိသူကိုသာ ဖွင့်ပေးပါ။
  - [ ] **Server-Side Verification:** Access check ကို Client UI တွင် မလုပ်ဘဲ Server ဘက်တွင်သာ စစ်ဆေးပါ။
  - [ ] **Ownership Check:** တောင်းဆိုလာသော Data ၏ ပိုင်ရှင် (Record Owner) ဟုတ်မဟုတ်ကို အမြဲစစ်ဆေးပါ။

### ၂။ Security Misconfiguration (စနစ်ဆက်တင်များ မှားယွင်းစွာ သတ်မှတ်ခြင်း)
* **ပြဿနာ:** ကုဒ်ထဲတွင် bug မရှိသော်လည်း server configuration သို့မဟုတ် framework configuration မှားယွင်းမှုကြောင့် ဖောက်ထွင်းခံရခြင်း။
* **ဥပမာ:** Production environment တွင် Debug mode ဖွင့်ထားခြင်း၊ stack trace အပြည့်အစုံ ပြသခြင်း၊ default password (admin/admin) မပြောင်းခြင်း။
* **စည်းကမ်းချက်များ:**
  - [ ] **Disable Debug Mode:** Production တွင် debug system ကို လုံးဝ ပိတ်ထားပါ။
  - [ ] **Change Defaults:** Default credentials အားလုံးကို မဖြစ်မနေ ပြောင်းလဲပါ။
  - [ ] **Minimise Exposure:** အသုံးပြုမလိုသော services များနှင့် ports များကို ပိတ်ထားပါ။

### ၃။ Software Supply Chain Failures (ပြင်ပ Libraries နှင့် Packages များမှတစ်ဆင့် ဖြစ်ပွားသော အားနည်းချက်)
* **ပြဿနာ:** မိမိရေးသားသော code မဟုတ်ဘဲ build pipeline, build tools သို့မဟုတ် third-party dependencies များမှတစ်ဆင့် risk ဝင်လာခြင်း (AI သုံး၍ code ရေးရာတွင် အဖြစ်အများဆုံး ဖြစ်သည်)။
* **ဥပမာ:** အန္တရာယ်ရှိသော npm package များ သုံးမိခြင်း (Dependency Confusion သို့မဟုတ် Typosquatting)။
* **စည်းကမ်းချက်များ:**
  - [ ] **Lockfile Usage:** `package-lock.json` သို့မဟုတ် `pnpm-lock.yaml` ဖိုင်များ သုံးပါ။
  - [ ] **Dependency Scanning:** `npm audit` သို့မဟုတ် dependencies scanner များဖြင့် အမြဲစစ်ဆေးပါ။
  - [ ] **Version Pinning:** Package version များကို strict သတ်မှတ်ထားပြီး မလိုလားအပ်သော update များ မဖြစ်အောင် ကာကွယ်ပါ။

### ၄။ Cryptographic Failures (လျှို့ဝှက်ချက်များအား မလုံခြုံစွာ သိမ်းဆည်းခြင်း)
* **ပြဿနာ:** အရေးကြီးသော အချက်အလက်များ (Passwords, API Keys, Credit Cards) ကို စနစ်တကျ မကာကွယ်ထားခြင်း။
* **ဥပမာ:** Password များကို Plaintext ဖြင့် သိမ်းဆည်းခြင်း သို့မဟုတ် အားနည်းသော Hash algorithms (MD5, SHA1) သုံးခြင်း။
* **စည်းကမ်းချက်များ:**
  - [ ] **Argon2id or Bcrypt:** Passwords များအတွက် strong hashing algorithms များကိုသာ သုံးပါ။
  - [ ] **No Plaintext:** မည်သည့် အရေးကြီး data ကိုမျှ raw plaintext ဖြင့် မသိမ်းဆည်းပါနှင့်။
  - [ ] **Proven Libraries Only:** ကိုယ်ပိုင် encryption code မရေးဘဲ စံသတ်မှတ်ချက်မီ standard library ကိုသာ သုံးပါ။

### ၅။ Injection (ပြင်ပမှ အန္တရာယ်ရှိသော ကုဒ်များ သွတ်သွင်းခံရခြင်း)
* **ပြဿနာ:** User input များကို server က code အဖြစ် မှားယွင်းအဓိပ္ပာယ်ဖွင့်ပြီး execute လုပ်မိခြင်း (SQLi, NoSQLi, Command Injection, XSS)။
* **ဥပမာ:** Form input မှတစ်ဆင့် database query ကို ဖျက်ဆီးပစ်ခြင်း။
* **စည်းကမ်းချက်များ:**
  - [ ] **Prepared Statements:** SQL Query များတွင် parameters များကို သီးသန့်ခွဲပို့ပါ။ string concatenations များကို လုံးဝမသုံးပါနှင့်။
  - [ ] **ORM/Query Builder:** အန္တရာယ်ကင်းသော ORM များကို သုံးစွဲပါ။
  - [ ] **Sanitisation & Encoding:** HTML render မလုပ်မီ input များကို encode လုပ်ပါ။

### ၆။ Insecure Design (ဒီဇိုင်းအဆင့်ကတည်းက ပါလာသော လုံခြုံရေးအားနည်းချက်)
* **ပြဿနာ:** ကုဒ်မရေးမီ software design အဆင့်ကတည်းက logic အမှားများ ပါဝင်လာခြင်း။
* **ဥပမာ:** လုံခြုံမှုမရှိသော လျှို့ဝှက်မေးခွန်းတစ်ခုတည်း (ဥပမာ- မွေးနေ့) မေးပြီး password reset ခွင့်ပြုထားခြင်း။
* **စည်းကမ်းချက်များ:**
  - [ ] **Threat Modeling:** Design အဆင့်တွင် တိုက်ခိုက်ခံရနိုင်သည့် ပုံစံများကို ကြိုတင်စဉ်းစားပါ။
  - [ ] **Secure-by-Design:** လုံခြုံရေးကို default feature အဖြစ် ထည့်သွင်းစဉ်းစားပါ။

### ၇။ Authentication Failures (စနစ်အတွင်း ဝင်ရောက်မှု အားနည်းချက်များ)
* **ပြဿနာ:** Login, Session သို့မဟုတ် Password reset လုပ်ငန်းစဉ်များတွင် ဖြစ်ပွားသော အားနည်းချက်များ။
* **ဥပမာ:** Login အား အကန့်အသတ်မရှိ (Brute Force) စမ်းသပ်ခွင့်ပေးထားခြင်း။
* **စည်းကမ်းချက်များ:**
  - [ ] **Rate Limiting:** Login နှင့် password reset APIs များတွင် တောင်းဆိုမှုနှုန်းကို ကန့်သတ်ပါ။
  - [ ] **MFA Support:** Multi-Factor Authentication ကို အားပေးပါ။
  - [ ] **Secure Session Cookie:** Session cookies များတွင် `HttpOnly`, `Secure` နှင့် `SameSite` flags များကို မဖြစ်မနေ သုံးပါ။

### ၈။ Software and Data Integrity Failures (ဆော့ဖ်ဝဲလ်နှင့် အချက်အလက်များ၏ သမာဓိပျက်ယွင်းခြင်း)
* **ပြဿနာ:** Software update များ သို့မဟုတ် data structures များကို အစစ်အမှန်ဟုတ်မဟုတ် မစစ်ဆေးဘဲ လက်ခံယုံကြည်ခြင်း။
* **ဥပမာ:** signature မပါသော plugins/updates များကို သွင်းယူခြင်း၊ Insecure Deserialization ဖြစ်ခြင်း။
* **စည်းကမ်းချက်များ:**
  - [ ] **Digital Signatures:** Update ဖိုင်များ၏ signatures နှင့် hashes များကို အမြဲ verify လုပ်ပါ။
  - [ ] **No Unsafe Deserialization:** ပြင်ပမှလာသော raw serialised object များကို လုံးဝ deserialize မလုပ်ပါနှင့်။

### ၉။ Security Logging and Alerting Failures (လုံခြုံရေးဆိုင်ရာ မှတ်တမ်းနှင့် အချက်ပေးစနစ် မရှိခြင်း)
* **ပြဿနာ:** တိုက်ခိုက်ခံရသည့်အခါ logs များ မရှိသဖြင့် တိုက်ခိုက်ခံနေရမှန်း မသိရှိခြင်း သို့မဟုတ် log ထဲတွင် sensitive information များ လျှံကျနေခြင်း။
* **ဥပမာ:** Brute-force တိုက်ခိုက်ခံရသော်လည်း server log တွင် မပေါ်ခြင်း သို့မဟုတ် log ဖိုင်ထဲတွင် user ၏ password များ plaintext အတိုင်း သွားသိမ်းခြင်း။
* **စည်းကမ်းချက်များ:**
  - [ ] **Log Failures:** Login failures နှင့် critical errors များကို သေချာစွာ log မှတ်ပါ။
  - [ ] **Sanitise Logs:** Log များထဲတွင် passwords, tokens နှင့် sensitive personal data (PII) များကို လုံးဝ မထည့်ပါနှင့်။

### ၁၀။ Mishandling of Exceptional Conditions (အမှားအယွင်းများအား စနစ်တကျ မကိုင်တွယ်နိုင်ခြင်း - ၂၀၂၅ အသစ်)
* **ပြဿနာ:** System configurations, exceptions သို့မဟုတ် timeouts များ တက်လာသည့်အခါ application က မလုံခြုံသော ပုံစံဖြင့် တုံ့ပြန်မိခြင်း။
* **ဥပမာ:** Permission စစ်သည့်ကုဒ်တွင် error တက်သွားသည့်အခါ user ကို access ပိတ်ရမည့်အစား auto-allow လုပ်ပေးလိုက်ခြင်း (Fail-Open)။
* **စည်းကမ်းချက်များ:**
  - [ ] **Fail-Secure (Fail-Closed):** Error/Exception တက်ပါက standard rule အနေဖြင့် အားလုံးကို လုံခြုံစွာ ပိတ်ချပါ (Default to Deny)။
  - [ ] **Generic Error Messages:** အပြင်လူကို error အသေးစိတ်ပြမည့်အစား သာမန် generic error စာသားသာ ပြသပါ (Stack trace များကို internal logger တွင်သာ သိမ်းဆည်းပါ)။

---

## 🛠️ Security Audit Report Layout (AI တုံ့ပြန်မည့် ပုံစံ)

အထက်ပါ စည်းကမ်းချက်များအတိုင်း ကုဒ်စစ်ဆေးခိုင်းပါက Assistant မှ အောက်ပါပုံစံအတိုင်း စနစ်တကျ ပြန်လည်ဖြေကြားပေးမည် ဖြစ်သည် -

1. **စစ်ဆေးမှု အနှစ်ချုပ် (Summary):** ခြုံငုံသုံးသပ်ချက်။
2. **တွေ့ရှိရသော အားနည်းချက်များ (Findings):** 
   - **Vulnerability:** [လုံခြုံရေးအားနည်းချက်အမျိုးအစား]
   - **Description:** [အမှားအယွင်းအသေးစိတ်]
   - **Risk Level:** [Low / Medium / High / Critical]
   - **Vulnerable Code:** [အန္တရာယ်ရှိသောကုဒ်လိုင်း]
   - **Remediation Code:** [ပြင်ဆင်ရမည့်ကုဒ်လိုင်း]
3. **လက်တွေ့လေ့ကျင့်ရန် Resources များ:** OWASP လင့်ခ်များနှင့် PortSwigger လင့်ခ်များ။
