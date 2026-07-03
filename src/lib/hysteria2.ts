/**
 * Utility functions to interact with the Hysteria2 Express Backend
 */

// Override fetch locally to enforce a 5-second timeout
const originalFetch = globalThis.fetch;
const fetch = async (url: string | URL | globalThis.Request, options?: RequestInit) => {
  return originalFetch(url, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(5000)
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
 * Log into the Hysteria Express Backend and return a JWT token.
 * 
 * @param apiUrl The base URL of the Hysteria server (e.g. https://vpn.domain.com/admin_123)
 * @param username Admin username
 * @param password Admin password
 * @returns JWT token string
 */
export async function loginHysteria(apiUrl: string, username?: string, password?: string): Promise<string> {
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
export async function createHysteriaUser(apiUrl: string, token: string, userUsername: string, userPassword: string, expiryDays?: number | null): Promise<number> {
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
  return data.id; // Returns the DB ID of the created user
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
 * Delete a user from Hysteria2
 * We need to find their ID first by fetching all users and matching the username/password
 */
export async function deleteHysteriaUser(apiUrl: string, token: string, userPassword: string, username?: string): Promise<void> {
  const base = getBaseUrl(apiUrl);
  
  // 1. Fetch all users
  const url = `${base}/api/users`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) return; // Silently fail or throw error

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
    // Matches the CLI manager format exactly: Port 443 with insecure=0 and sni
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
 * Fetch all users from Hysteria2 backend
 */
export async function fetchHysteriaUsers(apiUrl: string, token: string): Promise<HysteriaUser[]> {
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
