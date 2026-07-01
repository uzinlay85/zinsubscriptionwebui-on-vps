/**
 * Utility functions to interact with the Hysteria2 Express Backend
 */

export interface HysteriaUser {
  id: number;
  username: string;
  password?: string;
  data_limit_gb?: number;
  expiry_days?: number;
  status?: string;
}

/**
 * Clean up the API URL and support custom paths like reverse proxy suffixes (e.g. /hy2-api)
 */
function getBaseUrl(apiUrl: string): string {
  let base = apiUrl.trim().replace(/\/$/, "");
  if (!base.startsWith("http://") && !base.startsWith("https://")) {
    base = "http://" + base;
  }
  return base;
}

/**
 * Log into the Hysteria Express Backend and return a JWT token.
 * 
 * @param apiUrl The base URL of the Hysteria server (e.g. https://vpn.domain.com/admin_123 or IP:port)
 * @param username Admin username
 * @param password Admin password
 * @returns JWT token string
 */
export async function loginHysteria(apiUrl: string, username?: string, password?: string): Promise<string> {
  const baseOrigin = getBaseUrl(apiUrl);
  const url = `${baseOrigin}/api/login`;
  
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
  const baseOrigin = getBaseUrl(apiUrl);
  const url = `${baseOrigin}/api/users`;
  
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
  const baseOrigin = getBaseUrl(apiUrl);
  
  // 1. Fetch all users to find the ID by password
  const url = `${baseOrigin}/api/users`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) return;

  let usersData = await res.json();
  let users: HysteriaUser[] = Array.isArray(usersData) ? usersData : (usersData.users || usersData.data || []);
  
  const targetUser = users.find(u => u.password === userPassword || u.username === userUsername);
  
  if (targetUser) {
    // 2. Update the user
    await fetch(`${baseOrigin}/api/users/${targetUser.id}`, {
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
  const baseOrigin = getBaseUrl(apiUrl);
  
  // 1. Fetch all users
  const url = `${baseOrigin}/api/users`;
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
    await fetch(`${baseOrigin}/api/users/${targetUser.id}`, {
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
    // Remove protocol and add hysteria2://
    const host = url.hostname;
    // Default port is 443. Append standard port hopping (mport=20000-50000) for Hysteria2
    return `hysteria2://${username}:${password}@${host}:443/?sni=${host}&mport=20000-50000#${encodeURIComponent(name)}`;
  } catch (e) {
    // Fallback if domainUrl is invalid
    return `hysteria2://${username}:${password}@${domainUrl}:443/?sni=${domainUrl}&mport=20000-50000#${encodeURIComponent(name)}`;
  }
}

/**
 * Fetch all users from Hysteria2 backend
 */
export async function fetchHysteriaUsers(apiUrl: string, token: string): Promise<HysteriaUser[]> {
  const baseOrigin = getBaseUrl(apiUrl);
  
  const url = `${baseOrigin}/api/users`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) return [];

  let usersData = await res.json();
  let users: HysteriaUser[] = Array.isArray(usersData) ? usersData : (usersData.users || usersData.data || []);
  return users;
}
