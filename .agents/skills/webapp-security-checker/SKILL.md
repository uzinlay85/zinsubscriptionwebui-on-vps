---
name: webapp-security-checker
description: Web application security checker that audits and inspects code changes against the OWASP Top 10 2025 standards to identify vulnerabilities and suggest remediations.
---

# 🛡️ Web Application Security Checker (OWASP Top 10 2025 Auditing Skill)

This skill provides an automated code auditing framework based on the **OWASP Top 10 (2025 Edition)**. Whenever the user requests a code security review, analysis, or audit, apply the guidelines, checklists, and code patterns defined in this document.

---

## 📋 Security Auditing Checklist & Review Rules

When performing a code audit, evaluate the target code block against these 10 vulnerability categories:

### 1. Broken Access Control
* **Description:** Users can perform actions or access data outside their intended permissions (e.g., IDOR, privilege escalation).
* **Checks:**
  - Are resource IDs (e.g., `/api/invoice?id=123`) queried directly without verifying if the current authenticated user owns that resource?
  - Are access control checks missing on critical API endpoints (e.g., admin routes lacking admin authorization middleware)?
  - Is access control logic executed on the client-side only (e.g., hiding a button in React/Vue/HTML without server-side validation)?
* **Code Patterns:**
  * ❌ *Vulnerable (Node.js/Express):*
    ```javascript
    app.get('/api/invoice', async (req, res) => {
        const invoice = await db.getInvoice(req.query.id); // No user ownership check!
        res.json(invoice);
    });
    ```
  * a️ *Secure (Node.js/Express):*
    ```javascript
    app.get('/api/invoice', checkAuth, async (req, res) => {
        const invoice = await db.getInvoice(req.query.id);
        if (!invoice || invoice.userId !== req.user.id) { // Verify ownership!
            return res.status(403).json({ error: "Access Denied" });
        }
        res.json(invoice);
    });
    ```

### 2. Security Misconfiguration
* **Description:** Improper server, framework, or application configuration exposing sensitive endpoints or system details.
* **Checks:**
  - Is debug mode active in production (e.g., Flask `debug=True`, Node `NODE_ENV` not set to `production`)?
  - Are stack traces or internal server error details displayed directly to the end-user?
  - Are default credentials (e.g., `admin/admin`, `root/root`) allowed or default configurations left unchanged?
  - Are unused ports, services, or development files exposed in deployment?
* **Code Patterns:**
  * ❌ *Vulnerable:*
    ```python
    app.run(debug=True, host='0.0.0.0') # Exposes debugger console to the web!
    ```
  * a️ *Secure:*
    ```python
    app.run(debug=False, host='127.0.0.1') # Disable debug, bind locally or use production WSGI
    ```

### 3. Software Supply Chain Failures
* **Description:** Vulnerabilities introduced via unverified third-party dependencies, malicious packages, or insecure build pipelines.
* **Checks:**
  - Are third-party dependency versions unpinned or lack lockfiles (`package-lock.json`, `pnpm-lock.yaml`)?
  - Are third-party libraries updated and scanned for known vulnerabilities?
  - Are packages vulnerable to typosquatting or dependency confusion?
* **Actionable Commands:**
  - Run package audits regularly: `npm audit` or `yarn audit`.
  - Use lockfile-only installations in CI/CD: `npm ci` or `pnpm install --frozen-lockfile`.

### 4. Cryptographic Failures
* **Description:** Insufficient protection of sensitive data (passwords, API keys, PII) in transit or at rest.
* **Checks:**
  - Are passwords stored as plaintext or using weak hash algorithms (MD5, SHA1, SHA256 without salt)?
  - Are sensitive connection strings or API keys hardcoded in source files?
  - Is communication routed via unencrypted HTTP instead of HTTPS/TLS?
* **Code Patterns:**
  * ❌ *Vulnerable:*
    ```javascript
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(password).digest('hex'); // MD5 is broken!
    ```
  * a️ *Secure:*
    ```javascript
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(password, 12); // Strong Argon2id or bcrypt hashing!
    ```

### 5. Injection
* **Description:** User-supplied input is interpreted directly as commands or executable queries (SQL, NoSQL, Command, OS, XSS).
* **Checks:**
  - Are inputs concatenated directly into database queries instead of using parameterized queries?
  - Are shell commands executed directly using raw user inputs (OS Command Injection)?
  - Are user inputs rendered in HTML without proper sanitization/encoding (XSS)?
* **Code Patterns:**
  * ❌ *Vulnerable (SQL Injection):*
    ```javascript
    const query = `SELECT * FROM users WHERE username = '${req.body.username}' AND password = '${req.body.password}'`;
    db.execute(query);
    ```
  * a️ *Secure (Parameterized Query):*
    ```javascript
    const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
    db.execute(query, [req.body.username, req.body.password]); // Prepared statements!
    ```

### 6. Insecure Design
* **Description:** Security flaws originating from logical errors in design patterns and threat modeling before any code is written.
* **Checks:**
  - Are password reset questions weak or easily guessable (e.g., asking only for birthday)?
  - Is there a lack of multi-factor authentication (MFA) or security checkpoints for high-risk actions?
  - Are threat models missing for business logic workflows?

### 7. Authentication Failures
* **Description:** Vulnerabilities in login, session management, or password reset processes allowing attackers to compromise credentials or hijack sessions.
* **Checks:**
  - Is there a lack of rate-limiting on authentication endpoints (brute-force vulnerability)?
  - Are passwords allowed to be weak (lack of password complexity policy)?
  - Are session tokens transmitted insecurely (missing `HttpOnly`, `Secure`, or `SameSite` cookie flags)?
* **Code Patterns:**
  * ❌ *Vulnerable (Session Cookie):*
    ```javascript
    res.cookie('session_token', token); // Vulnerable to XSS theft!
    ```
  * a️ *Secure:*
    ```javascript
    res.cookie('session_token', token, { httpOnly: true, secure: true, sameSite: 'Strict' });
    ```

### 8. Software and Data Integrity Failures
* **Description:** Failure to verify the integrity and source of code updates, plugins, or serialized data payloads.
* **Checks:**
  - Does the application deserialize untrusted inputs without validation (Insecure Deserialization)?
  - Are software updates or file downloads accepted without checking digital signatures or hashes?
  - Are data structures parsed raw from client inputs without schemas (e.g., JSON schema validation)?

### 9. Security Logging and Alerting Failures
* **Description:** Failure to record security events, login failures, or access anomalies, making it impossible to detect or respond to active intrusions.
* **Checks:**
  - Are login failures, authorization errors, or input validation errors ignored and not logged?
  - Are sensitive values (passwords, session tokens, raw credit card data) stored directly in application log files?
  - Are active intrusion patterns not alerting system administrators?

### 10. Mishandling of Exceptional Conditions (New in 2025)
* **Description:** Security vulnerabilities resulting from errors, timeouts, or exceptions that fail insecurely or expose internal mechanisms.
* **Checks:**
  - Does a permission check failure throw an exception that defaults to granting access (Fail-Open)?
  - Are detailed system details or database connection strings leaked during runtime exceptions?
  - Are empty, null, or timeout values handled without safe fallbacks?
* **Code Patterns:**
  * ❌ *Vulnerable (Fail-Open):*
    ```javascript
    try {
        checkAccess(user);
    } catch (error) {
        // Exception caught, but logic continues to grant access!
    }
    grantAccess();
    ```
  * a️ *Secure (Fail-Secure/Fail-Closed):*
    ```javascript
    let hasAccess = false;
    try {
        hasAccess = checkAccess(user);
    } catch (error) {
        logError(error); // Log internally, keep hasAccess = false
    }
    if (hasAccess) {
        grantAccess();
    } else {
        res.status(403).send("Forbidden");
    }
    ```

---

## 📊 Standard Security Audit Report Template

When performing an audit, provide the report in the following structured layout:

### 🛡️ Code Security Audit Report

#### Summary
Provide a brief summary of the audited code and its overall security risk state.

#### Detailed Findings
For each vulnerability identified, use the following format:
* **Vulnerability:** [Category Name (e.g., Broken Access Control)]
* **Description:** [Brief explanation of the vulnerability in the code]
* **Risk Level:** [Low / Medium / High / Critical]
* **Vulnerable Code Reference:**
  ```[language]
  // Highlight the vulnerable lines of code here
  ```
* **Remediation Code Suggestion:**
  ```[language]
  // Highlight the secure, corrected code here
  ```

#### Resources & Mitigation Links
Provide references to:
* [OWASP Top 10 (2025)](https://owasp.org/Top10/2025/)
* [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
* [PortSwigger Web Security Academy](https://portswigger.net/web-security)
