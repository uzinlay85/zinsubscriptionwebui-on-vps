/**
 * Utility functions to interact with the Hysteria2 Express Backend and Python Web Panel
 */

// Override fetch locally to enforce a 15-second timeout (accommodates slow/low-spec VPS)
const originalFetch = globalThis.fetch;
const fetch = async (url: string | URL | globalThis.Request, options?: RequestInit) => {
  return originalFetch(url, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(15000)
  });
};

export interface HysteriaUser {
  id: number;
  username: string;
  password?: string;
  data_limit_gb?: number;
  expiry_days?: number;
  status?: string;
}

/**
 * Helper function to extract base URL while preserving subpaths (e.g. /hy2-api)
 * and handling trailing slashes.
 */
function getBaseUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    let base = url.origin + url.pathname;
    if (base.endsWith('/')) {
      base = base.slice(0, -1);
    }
    return base;
  } catch (e) {
    let base = apiUrl;
    if (base.endsWith('/')) {
      base = base.slice(0, -1);
    }
    return base;
  }
}

/**
 * Parse formatted bytes string from Flask Web UI (e.g. "1.23 GB", "456.2 MB", "0 B") into raw bytes.
 */
export function parseFormattedBytes(str: string): number {
  if (!str) return 0;
  const match = str.trim().match(/^([\d.]+)\s*([a-zA-Z]+)$/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  const multiplier: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024
  };
  return Math.floor(val * (multiplier[unit] || 1));
}

/**
 * Check if the given token is a serialized Flask panel token.
 */
export function isFlaskToken(token: string): boolean {
  try {
    const parsed = JSON.parse(token);
    return !!parsed?.isFlask;
  } catch {
    return false;
  }
}

/**
 * Authenticate with the Python Flask-based Web Management Panel.
 * Returns a serialized JSON string containing cookie and CSRF token.
 */
export async function loginHysteriaFlask(apiUrl: string, password?: string): Promise<string> {
  const base = getBaseUrl(apiUrl);
  
  // 1. GET `/login` to obtain the initial session cookie and CSRF token
  const getRes = await fetch(`${base}/login`);
  const initialCookie = getRes.headers.get("set-cookie") || "";
  const html = await getRes.text();
  
  const csrfMatch = html.match(/name="csrf_token"\s+value="([^"]+)"/i);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  // 2. POST to `/login` to log in
  const body = new URLSearchParams();
  body.append("csrf_token", csrfToken);
  body.append("admin_pass", password || "");

  const loginRes = await fetch(`${base}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(initialCookie ? { "Cookie": initialCookie.split(";")[0] } : {})
    },
    body: body.toString(),
    redirect: "manual"
  });

  const sessionCookie = loginRes.headers.get("set-cookie") || initialCookie;
  const cookieVal = sessionCookie.split(";")[0];

  // 3. GET `/` to retrieve the authenticated session CSRF token for subsequent requests
  const indexRes = await fetch(`${base}/`, {
    headers: {
      ...(cookieVal ? { "Cookie": cookieVal } : {})
    }
  });
  const indexHtml = await indexRes.text();
  const indexCsrfMatch = indexHtml.match(/name="csrf_token"\s+value="([^"]+)"/i);
  const finalCsrfToken = indexCsrfMatch ? indexCsrfMatch[1] : csrfToken;

  return JSON.stringify({
    cookie: cookieVal,
    csrfToken: finalCsrfToken,
    isFlask: true
  });
}

/**
 * Log into the Hysteria server (supports both Express Backend and Python Flask Web Panel).
 */
export async function loginHysteria(apiUrl: string, username?: string, password?: string): Promise<string> {
  if (username === "python_flask") {
    return loginHysteriaFlask(apiUrl, password);
  }

  const base = getBaseUrl(apiUrl);
  const url = `${base}/api/login`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!res.ok) {
    throw new Error(`Hysteria login failed: ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.ok || !data.token) {
    throw new Error("Failed to get JWT token from Hysteria backend");
  }

  return data.token;
}

/**
 * Create a new user in Hysteria2
 */
export async function createHysteriaUser(
  apiUrl: string,
  token: string,
  userUsername: string,
  userPassword: string,
  expiryDays?: number | null
): Promise<number> {
  if (isFlaskToken(token)) {
    const { cookie, csrfToken } = JSON.parse(token);
    const base = getBaseUrl(apiUrl);
    
    const body = new URLSearchParams();
    body.append("csrf_token", csrfToken);
    body.append("user_name", userUsername);
    body.append("user_pass", userPassword);
    body.append("limit_gb", "0"); // Default to unlimited
    body.append("days", expiryDays ? String(expiryDays) : "0");

    const res = await fetch(`${base}/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookie
      },
      body: body.toString(),
      redirect: "manual"
    });

    if (!res.ok && res.status !== 302) {
      throw new Error(`Flask user creation failed: ${res.statusText}`);
    }
    return 0; // Flask panel does not return a DB ID, so return 0
  }

  const base = getBaseUrl(apiUrl);
  const url = `${base}/api/users`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      username: userUsername,
      password: userPassword,
      expiry_days: expiryDays
    })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(`Failed to create Hysteria user: ${errorData?.error || res.statusText}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Update an existing user in Hysteria2 (e.g. to extend expiry)
 */
export async function updateHysteriaUser(
  apiUrl: string, 
  token: string, 
  userPassword: string, 
  userUsername: string, 
  expiryDays?: number | null
): Promise<void> {
  if (isFlaskToken(token)) {
    // Flask UI does not have an edit API, so we delete and re-create the user credential
    await deleteHysteriaUser(apiUrl, token, userPassword, userUsername);
    await createHysteriaUser(apiUrl, token, userUsername, userPassword, expiryDays);
    return;
  }

  const base = getBaseUrl(apiUrl);
  
  // 1. Fetch all users to find the ID by password
  const url = `${base}/api/users`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) return;

  let usersData = await res.json();
  let users: HysteriaUser[] = Array.isArray(usersData) ? usersData : (usersData.users || usersData.data || []);
  
  const targetUser = users.find(u => u.password === userPassword || u.username === userUsername);
  
  if (targetUser) {
    // 2. Update the user
    await fetch(`${base}/api/users/${targetUser.id}`, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({
        username: userUsername,
        password: userPassword,
        expiry_days: expiryDays
      })
    });
  }
}

/**
 * Disable a Hysteria2 user (block without deleting).
 */
export async function disableHysteriaUser(
  apiUrl: string,
  token: string,
  userPassword: string,
  userUsername: string
): Promise<void> {
  if (isFlaskToken(token)) {
    // For Flask panel, disable is done by deleting the user from the daemon list
    await deleteHysteriaUser(apiUrl, token, userPassword, userUsername);
    return;
  }

  const base = getBaseUrl(apiUrl);
  const url = `${base}/api/users`;
  const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
  if (!res.ok) return;

  let usersData = await res.json();
  let users: HysteriaUser[] = Array.isArray(usersData) ? usersData : (usersData.users || usersData.data || []);
  const targetUser = users.find(u => u.password === userPassword || u.username === userUsername);

  if (targetUser) {
    await fetch(`${base}/api/users/${targetUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ username: targetUser.username, password: targetUser.password, expiry_days: 0 })
    });
  }
}

/**
 * Re-enable a previously disabled Hysteria2 user.
 */
export async function enableHysteriaUser(
  apiUrl: string,
  token: string,
  userPassword: string,
  userUsername: string,
  expiryDays: number | null
): Promise<void> {
  if (isFlaskToken(token)) {
    // For Flask panel, enable is done by creating/re-adding the user back
    await createHysteriaUser(apiUrl, token, userUsername, userPassword, expiryDays);
    return;
  }

  const base = getBaseUrl(apiUrl);
  const url = `${base}/api/users`;
  const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
  if (!res.ok) return;

  let usersData = await res.json();
  let users: HysteriaUser[] = Array.isArray(usersData) ? usersData : (usersData.users || usersData.data || []);
  const targetUser = users.find(u => u.password === userPassword || u.username === userUsername);

  if (targetUser) {
    await fetch(`${base}/api/users/${targetUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ username: targetUser.username, password: targetUser.password, expiry_days: expiryDays })
    });
  }
}

/**
 * Delete a user from Hysteria2
 */
export async function deleteHysteriaUser(
  apiUrl: string, 
  token: string, 
  userPassword: string, 
  username?: string
): Promise<void> {
  if (isFlaskToken(token)) {
    const { cookie, csrfToken } = JSON.parse(token);
    const base = getBaseUrl(apiUrl);
    
    const body = new URLSearchParams();
    body.append("csrf_token", csrfToken);
    body.append("user_pass", userPassword);

    const res = await fetch(`${base}/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookie
      },
      body: body.toString(),
      redirect: "manual"
    });

    if (!res.ok && res.status !== 302) {
      throw new Error(`Flask user deletion failed: ${res.statusText}`);
    }
    return;
  }

  const base = getBaseUrl(apiUrl);
  
  // 1. Fetch all users
  const url = `${base}/api/users`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) return;

  let usersData = await res.json();
  let users: HysteriaUser[] = Array.isArray(usersData) ? usersData : (usersData.users || usersData.data || []);
  
  // 2. Find the user by password or username
  const targetUser = users.find(u => u.password === userPassword || (username && u.username === username));
  
  if (targetUser) {
    // 3. Delete the user
    await fetch(`${base}/api/users/${targetUser.id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
  }
}

/**
 * Build a hysteria2:// URI
 */
export function buildHysteriaUri(domainUrl: string, username: string, password: string, name: string): string {
  try {
    const url = new URL(domainUrl);
    const host = url.hostname;
    return `hysteria2://${username}:${password}@${host}:443?insecure=0&sni=${host}#${encodeURIComponent(name)}`;
  } catch (e) {
    let host = domainUrl;
    try {
      if (domainUrl.includes('://')) {
        host = new URL(domainUrl).hostname;
      } else if (domainUrl.includes('/')) {
        host = domainUrl.split('/')[0];
      }
    } catch(err) {}
    return `hysteria2://${username}:${password}@${host}:443?insecure=0&sni=${host}#${encodeURIComponent(name)}`;
  }
}

/**
 * Build a hy2:// URI with Port Hopping support for the Flask panel
 */
export function buildHysteriaFlaskUri(domainUrl: string, username: string, password: string, name: string): string {
  try {
    let host = domainUrl;
    let port = "443";
    try {
      if (domainUrl.includes('://')) {
        const url = new URL(domainUrl);
        host = url.hostname;
        port = url.port || "443";
      } else {
        const parts = domainUrl.split(":");
        host = parts[0];
        port = parts[1] || "443";
      }
    } catch {}
    
    return `hy2://${password}@${host}:${port}/?insecure=0&sni=${host}&mport=20000-50000#${encodeURIComponent(name)}`;
  } catch (e) {
    return `hy2://${password}@${domainUrl}/?insecure=0&sni=${domainUrl}&mport=20000-50000#${encodeURIComponent(name)}`;
  }
}

/**
 * Fetch all users from Hysteria2 backend
 */
export async function fetchHysteriaUsers(apiUrl: string, token: string): Promise<HysteriaUser[]> {
  if (isFlaskToken(token)) {
    const { cookie } = JSON.parse(token);
    const base = getBaseUrl(apiUrl);
    const res = await fetch(`${base}/`, {
      headers: { "Cookie": cookie }
    });
    if (!res.ok) return [];
    const html = await res.text();
    
    const users: HysteriaUser[] = [];
    const rowRegex = /<tr>\s*<td>\s*<b>([^<]+)<\/b>\s*<\/td>\s*<td>\s*<code>([^<]+)<\/code>\s*<\/td>\s*<td>[\s\S]*?<\/td>\s*<td[^>]*>\s*<span class="usage-badge">⬇️\s*([^<]+)<\/span>\s*<br>\s*<span class="usage-badge"[^>]*>⬆️\s*([^<]+)<\/span>/g;
    
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const name = match[1].trim();
      const password = match[2].trim();
      users.push({
        id: 0,
        username: name,
        password: password,
        status: "active"
      });
    }
    return users;
  }

  const base = getBaseUrl(apiUrl);
  const url = `${base}/api/users`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) return [];

  let usersData = await res.json();
  let users: HysteriaUser[] = Array.isArray(usersData) ? usersData : (usersData.users || usersData.data || []);
  return users;
}
