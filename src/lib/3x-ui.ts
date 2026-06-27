// Rewrite of 3x-ui.ts using native Next.js fetch

export async function login3xui(apiUrl: string, username?: string, password?: string): Promise<string> {
  const cleanUrl = apiUrl.replace(/\/$/, "");
  
  // 1. Initial GET request to extract CSRF token and initial session cookie
  const getRes = await fetch(`${cleanUrl}/`);
  const initialCookie = getRes.headers.get("set-cookie") || "";
  const html = await getRes.text();
  
  const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/i);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  // 2. Perform the actual POST login
  const body = new URLSearchParams();
  body.append("username", username || "");
  body.append("password", password || "");

  const res = await fetch(`${cleanUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      ...(csrfToken ? { "X-Csrf-Token": csrfToken } : {}),
      ...(initialCookie ? { "Cookie": initialCookie } : {})
    },
    body: body.toString(),
  });

  const responseText = await res.text();
  let data;
  
  try {
    data = JSON.parse(responseText);
  } catch (err) {
    throw new Error(`Invalid Response (Status: ${res.status}): ${responseText.substring(0, 100)}`);
  }

  if (!res.ok || !data?.success) {
    throw new Error(data?.msg || `Login failed with status ${res.status}`);
  }

  // 3. Extract the authenticated session cookie
  const setCookieHeader = res.headers.get("set-cookie");
  const finalCookieHeader = setCookieHeader || initialCookie;
  
  if (!finalCookieHeader) {
    throw new Error("No session cookie returned from 3x-ui");
  }

  // The cookie might be named 'session' or '3x-ui' or something else
  // Grab the first part before ';' which is the key=value pair
  const authCookie = finalCookieHeader.split(";")[0];
  if (authCookie) {
    return authCookie;
  }

  throw new Error("Invalid cookie format received");
}

export async function addClient3xui(
  apiUrl: string,
  cookie: string,
  inboundId: number,
  clientEmail: string,
  uuid: string
): Promise<void> {
  const cleanUrl = apiUrl.replace(/\/$/, "");
  
  // 1. Fetch CSRF token for the API request
  const csrfRes = await fetch(`${cleanUrl}/`, {
    headers: { "Cookie": cookie }
  });
  const html = await csrfRes.text();
  const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/i);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  // 2. Fetch the existing inbound to append the client and check protocol
  const getRes = await fetch(`${cleanUrl}/panel/api/inbounds/get/${inboundId}`, {
    method: "GET",
    headers: {
      "Cookie": cookie,
      "Accept": "application/json",
    }
  });

  const getData = await getRes.json().catch(() => null);

  if (!getRes.ok || !getData || !getData.success) {
    throw new Error("Failed to get inbound");
  }

  const inbound = getData.obj;
  const protocol = inbound.protocol;
  let settings;
  try {
    settings = typeof inbound.settings === "string" ? JSON.parse(inbound.settings) : inbound.settings;
  } catch (e) {
    settings = { clients: [] };
  }
  
  // Check if client already exists
  if (settings.clients && settings.clients.some((c: any) => c.email === clientEmail)) {
    return; // Already exists
  }

  // Define new client dynamically based on protocol
  const randomSubId = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  const newClient: any = {
    email: clientEmail,
    limitIp: 0,
    totalGB: 0,
    expiryTime: 0,
    enable: true,
    tgId: 0,
    subId: randomSubId.substring(0, 16),
    reset: 0,
    group: "",
    comment: ""
  };

  if (protocol === "vmess" || protocol === "vless") {
    newClient.id = uuid;
    if (protocol === "vmess") {
      newClient.alterId = 0;
    }
  }

  if (protocol === "vless") {
    newClient.flow = "";
  }

  if (protocol === "trojan" || protocol === "shadowsocks") {
    newClient.password = uuid;
  }

  const addBody = JSON.stringify({
    client: newClient,
    inboundIds: [inboundId]
  });

  const addRes = await fetch(`${cleanUrl}/panel/api/clients/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Cookie": cookie,
      ...(csrfToken ? { "X-Csrf-Token": csrfToken } : {})
    },
    body: addBody
  });

  const responseText = await addRes.text();
  let addData;
  try {
    addData = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`Invalid JSON response from 3x-ui (Status ${addRes.status}): ${responseText.substring(0, 100)}`);
  }

  if (!addRes.ok || !addData || !addData.success) {
    throw new Error(`3x-ui Error: ${addData?.msg || 'None'}. Status: ${addRes.status}. Request: ${addBody}. Response: ${responseText.substring(0, 200)}`);
  }
}

export async function deleteClient3xui(
  apiUrl: string,
  cookie: string,
  inboundId: number,
  uuid: string
): Promise<void> {
  const cleanUrl = apiUrl.replace(/\/$/, "");
  
  // Fetch CSRF token for the API request
  const csrfRes = await fetch(`${cleanUrl}/`, {
    headers: { "Cookie": cookie }
  });
  const html = await csrfRes.text();
  const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/i);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  // UUID is often used to delete in 3x-ui API
  const delRes = await fetch(`${cleanUrl}/panel/api/inbounds/${inboundId}/delClient/${uuid}`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Cookie": cookie,
      ...(csrfToken ? { "X-Csrf-Token": csrfToken } : {})
    }
  });

  const responseText = await delRes.text();
  let delData;
  try {
    delData = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`Invalid JSON response from 3x-ui on delete (Status ${delRes.status}): ${responseText.substring(0, 100)}`);
  }

  if (!delRes.ok || !delData || !delData.success) {
    throw new Error(`3x-ui Error: ${delData?.msg || 'None'}. Status: ${delRes.status}. Response: ${responseText.substring(0, 200)}`);
  }
}

export async function getClientTraffics(apiUrl: string, cookie: string): Promise<any[]> {
  const cleanUrl = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${cleanUrl}/panel/api/inbounds/clientTraffics`, {
    method: "GET",
    headers: {
      "Cookie": cookie,
    }
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || !data.success) {
    throw new Error("Failed to get traffics");
  }

  return data.obj || [];
}
