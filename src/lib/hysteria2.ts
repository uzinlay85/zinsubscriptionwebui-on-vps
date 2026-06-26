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
 * Log into the Hysteria Express Backend and return a JWT token.
 * 
 * @param apiUrl The base URL of the Hysteria server (e.g. https://vpn.domain.com/admin_123)
 * @param username Admin username
 * @param password Admin password
 * @returns JWT token string
 */
export async function loginHysteria(apiUrl: string, username?: string, password?: string): Promise<string> {
  let baseOrigin = apiUrl;
  try {
    baseOrigin = new URL(apiUrl).origin;
  } catch (e) {
    // Ignore invalid URL parsing errors
  }
  
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
  let baseOrigin = apiUrl;
  try { baseOrigin = new URL(apiUrl).origin; } catch(e) {}
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
  let baseOrigin = apiUrl;
  try { baseOrigin = new URL(apiUrl).origin; } catch(e) {}
  
  // 1. Fetch all users to find the ID by password
  const url = `${baseOrigin}/api/users`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) return;

  const users: HysteriaUser[] = await res.json();
  const targetUser = users.find(u => u.password === userPassword);
  
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
export async function deleteHysteriaUser(apiUrl: string, token: string, userPassword: string): Promise<void> {
  let baseOrigin = apiUrl;
  try { baseOrigin = new URL(apiUrl).origin; } catch(e) {}
  
  // 1. Fetch all users
  const url = `${baseOrigin}/api/users`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) return; // Silently fail or throw error

  const users: HysteriaUser[] = await res.json();
  
  // 2. Find the user by password (password acts as unique key in Hysteria auth)
  const targetUser = users.find(u => u.password === userPassword);
  
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
