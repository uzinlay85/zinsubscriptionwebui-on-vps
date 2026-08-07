// Rewrite of 3x-ui.ts using native Next.js fetch

// Override fetch locally to enforce a 5-second timeout
const originalFetch = globalThis.fetch;
const fetch = async (url: string | URL | globalThis.Request, options?: RequestInit) => {
  return originalFetch(url, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(5000)
  });
};

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
  uuid: string,
  serverName: string,
  server: any = {}
): Promise<string> {
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
    const existing = settings.clients.find((c: any) => c.email === clientEmail);
    if (existing && existing.subId) {
      return fetchOrBuildLink(cleanUrl, existing.subId, serverName, inbound, existing, apiUrl, server);
    }
    return ""; // Already exists but no subId found
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

  // If email is already in use (out-of-sync state), fetch the existing client's link
  if (!addData?.success && addData?.msg && addData.msg.toLowerCase().includes("email already in use")) {
    // Re-fetch the inbound to get the existing client's data
    const retryRes = await fetch(`${cleanUrl}/panel/api/inbounds/get/${inboundId}`, {
      method: "GET",
      headers: { "Cookie": cookie, "Accept": "application/json" }
    });
    const retryData = await retryRes.json().catch(() => null);
    if (retryData?.success && retryData?.obj) {
      const retrySettings = typeof retryData.obj.settings === "string"
        ? JSON.parse(retryData.obj.settings)
        : retryData.obj.settings;
      const existingClient = retrySettings?.clients?.find((c: any) => c.email === clientEmail);
      if (existingClient) {
        return fetchOrBuildLink(cleanUrl, existingClient.subId || "", serverName, retryData.obj, existingClient, apiUrl, server);
      }
    }
    // Could not recover - just return empty string to avoid blocking sync
    return "";
  }

  if (!addRes.ok || !addData || !addData.success) {
    throw new Error(`3x-ui Error: ${addData?.msg || 'None'}. Status: ${addRes.status}. Request: ${addBody}. Response: ${responseText.substring(0, 200)}`);
  }

  return fetchOrBuildLink(cleanUrl, newClient.subId, serverName, inbound, newClient, apiUrl, server);
}

function adjustClientLink(link: string, inbound: any, server: any, serverName: string): string {
  try {
    if (!link) return "";
    
    let stream;
    try {
      stream = typeof inbound.streamSettings === "string" ? JSON.parse(inbound.streamSettings) : inbound.streamSettings;
    } catch(e) {
      stream = {};
    }
    const extProxy = stream.externalProxy?.[0] || {};
    
    const extHost = server.external_domain || extProxy.dest || "";
    const extPort = server.external_port || extProxy.port || 0;
    
    if (link.startsWith("vmess://")) {
      const b64 = link.substring(8).trim();
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const obj = JSON.parse(decoded);
      
      if (extHost) {
        obj.add = extHost;
      }
      if (extPort) {
        obj.port = extPort;
      }
      if (obj.port === 443 || extPort === 443) {
        obj.tls = "tls";
        if (!obj.sni) obj.sni = obj.add;
        if (!obj.host) obj.host = obj.add;
      }
      if (serverName) {
        obj.ps = serverName;
      }
      return `vmess://${Buffer.from(JSON.stringify(obj)).toString("base64")}`;
    }
    
    if (link.startsWith("vless://") || link.startsWith("trojan://")) {
      const type = link.startsWith("vless://") ? "vless" : "trojan";
      const parts = link.substring(type.length + 3).split("#");
      const mainPart = parts[0];
      const hashPart = parts[1] || "";
      
      const mainSplit = mainPart.split("?");
      const connectionPart = mainSplit[0];
      const queryPart = mainSplit[1] || "";
      
      const connSplit = connectionPart.split("@");
      const credentials = connSplit[0];
      const hostPort = connSplit[1];
      
      const hpSplit = hostPort.split(":");
      let currentHost = hpSplit[0];
      let currentPort = hpSplit[1] || "";
      
      let finalHost = extHost || currentHost;
      let finalPort = extPort ? String(extPort) : currentPort;
      
      const params = new URLSearchParams(queryPart);
      if (Number(finalPort) === 443) {
        params.set("security", "tls");
        if (extProxy.sni) {
          params.set("sni", extProxy.sni);
        } else if (!params.get("sni")) {
          params.set("sni", finalHost);
        }
        if (!params.get("host") && params.get("type") === "ws") {
          params.set("host", finalHost);
        }
      }
      
      const qs = params.toString();
      const finalHash = serverName ? encodeURIComponent(serverName) : hashPart;
      
      return `${type}://${credentials}@${finalHost}:${finalPort}${qs ? "?" + qs : ""}${finalHash ? "#" + finalHash : ""}`;
    }
  } catch (e) {
    console.error("Error adjusting client link:", e);
  }
  return link;
}

async function fetchOrBuildLink(cleanUrl: string, subId: string, serverName: string, inbound: any, clientObj: any, apiUrl: string, server: any): Promise<string> {
  // Try to fetch the link from the panel's own subscription endpoint to get accurate external proxies/hosts
  try {
    const subRes = await fetch(`${cleanUrl}/sub/${subId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      }
    });

    if (subRes.ok) {
      const bodyText = await subRes.text();
      let decoded = bodyText;
      if (!bodyText.includes("://")) {
        try {
          decoded = Buffer.from(bodyText, "base64").toString("utf-8");
        } catch (e) {}
      }
      const links = decoded.split("\n").filter((l: string) => l.trim().length > 0 && l.includes("://"));
      if (links.length > 0) {
        // Return the first link adjusted with external Proxy / host / port info
        return adjustClientLink(links[0], inbound, server, serverName);
      }
    }
  } catch (err) {
    console.error("Failed to fetch sub link directly from panel:", err);
  }

  // Fallback: Generate raw URI directly if the sub endpoint fails or is customized
  return build3xuiLink(inbound, clientObj, serverName, apiUrl, server);
}

function build3xuiLink(inbound: any, client: any, serverName: string, apiUrl: string, server: any): string {
  const protocol = inbound.protocol;
  let stream;
  try {
    stream = typeof inbound.streamSettings === "string" ? JSON.parse(inbound.streamSettings) : inbound.streamSettings;
  } catch(e) {
    stream = {};
  }
  
  const net = stream.network || "tcp";
  let sec = stream.security || "none";
  
  let host = "";
  let path = "";
  let sni = "";
  let alpn = "";
  let fingerprint = "";

  if (net === "ws") {
    path = stream.wsSettings?.path || "";
    host = stream.wsSettings?.headers?.Host || "";
  } else if (net === "grpc") {
    path = stream.grpcSettings?.serviceName || "";
  } else if (net === "tcp") {
    if (stream.tcpSettings?.header?.type === "http") {
      host = stream.tcpSettings?.header?.request?.headers?.Host?.[0] || "";
      path = stream.tcpSettings?.header?.request?.path?.[0] || "";
    }
  }

  // Parse external proxy if available
  const extProxy = stream.externalProxy?.[0] || {};

  if (sec === "tls" || sec === "reality") {
    const tlsSet = sec === "reality" ? stream.realitySettings : stream.tlsSettings;
    sni = tlsSet?.serverName || "";
    if (tlsSet?.alpn && tlsSet.alpn.length > 0) {
      alpn = tlsSet.alpn.join(",");
    }
  } else if (extProxy.forceTls === "tls" || extProxy.dest) {
    if (extProxy.forceTls === "tls") sec = "tls";
    sni = extProxy.sni || sni;
    if (extProxy.alpn && extProxy.alpn.length > 0) {
      alpn = extProxy.alpn.join(",");
    }
    fingerprint = extProxy.fingerprint || "";
  }

  // Use explicit external domain if provided, else fallback to externalProxy, sni, host, or apiUrl
  let address = server.external_domain || extProxy.dest || sni || host;
  if (!address) {
    try {
      address = new URL(apiUrl).hostname;
    } catch(e) {
      address = apiUrl;
    }
  }

  // Use explicit external port if provided, else fallback to externalProxy or inbound port
  let port = server.external_port || extProxy.port || inbound.port;

  // If external port is 443, it's highly likely they are using TLS (e.g. via Cloudflare)
  if (port === 443 && sec === "none") {
    sec = "tls";
    // Also use the external domain as host/sni if not already set
    if (!host && net === "ws") host = address;
    if (!sni) sni = address;
  }

  const query = new URLSearchParams();
  query.set("type", net);
  if (sec !== "none") query.set("security", sec);
  if (sni) query.set("sni", sni);
  if (alpn) query.set("alpn", alpn);
  if (host) query.set("host", host);
  if (path) query.set("path", path);
  if (fingerprint) query.set("fp", fingerprint);

  if (protocol === "vless") {
    query.set("encryption", "none");
    if (sec === "reality") {
      query.set("pbk", stream.realitySettings?.settings?.publicKey || "");
      query.set("fp", stream.realitySettings?.settings?.fingerprint || "chrome");
      if (stream.realitySettings?.settings?.spiderX) query.set("spx", stream.realitySettings.settings.spiderX);
      if (stream.realitySettings?.serverNames && stream.realitySettings.serverNames.length > 0) {
         query.set("sni", stream.realitySettings.serverNames[0]);
      }
    }
    const qs = query.toString();
    return `vless://${client.id}@${address}:${port}${qs ? "?" + qs : ""}#${encodeURIComponent(serverName)}`;
  } else if (protocol === "vmess") {
    const vmessObj = {
      v: "2",
      ps: serverName,
      add: address,
      port: port,
      id: client.id,
      aid: client.alterId || 0,
      scy: "auto",
      net: net,
      type: "none",
      host: host,
      path: path,
      tls: sec,
      sni: sni,
      alpn: alpn
    };
    return `vmess://${Buffer.from(JSON.stringify(vmessObj)).toString("base64")}`;
  } else if (protocol === "trojan") {
    const qs = query.toString();
    return `trojan://${client.password}@${address}:${port}${qs ? "?" + qs : ""}#${encodeURIComponent(serverName)}`;
  }

  return "";
}

export async function deleteClient3xui(
  apiUrl: string,
  cookie: string,
  inboundId: number,
  uuid: string
): Promise<void> {
  const cleanUrl = apiUrl.replace(/\/$/, "");
  const headers = {
    "Cookie": cookie,
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  // Helper: safely parse JSON from a Response without crashing on empty body
  const safeJson = async (res: Response): Promise<any> => {
    const text = await res.text();
    if (!text || text.trim() === "") return { success: res.ok };
    try { return JSON.parse(text); } catch { return { success: res.ok, msg: text.substring(0, 100) }; }
  };

  // ATTEMPT 1: Standard Sanaei / Modern 3x-ui API
  const path1 = `${cleanUrl}/panel/api/inbounds/${inboundId}/delClient/${uuid}`;
  const res1 = await fetch(path1, { method: "POST", headers });

  if (res1.status === 200) {
    const data = await safeJson(res1);
    if (!data.success) {
      if (data.msg && data.msg.toLowerCase().includes("not found")) return;
      throw new Error(data.msg || "Failed to delete from 3x-ui");
    }
    return;
  }

  // ATTEMPT 2: Universal X-UI Update Method (Fallback for 404/405)
  // Fetch a fresh CSRF token needed for the update endpoint
  const homeRes = await fetch(`${cleanUrl}/`, { headers: { "Cookie": cookie, "User-Agent": headers["User-Agent"] } });
  const homeHtml = await homeRes.text();
  const csrfMatch = homeHtml.match(/name="csrf-token"\s+content="([^"]+)"/i);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";
  const headersWithCsrf = csrfToken ? { ...headers, "X-Csrf-Token": csrfToken } : headers;

  const getRes = await fetch(`${cleanUrl}/panel/api/inbounds/get/${inboundId}`, { method: "GET", headers: headersWithCsrf });
  if (!getRes.ok) throw new Error(`Universal Delete: Failed to fetch inbound (Status ${getRes.status})`);

  const getData = await safeJson(getRes);
  if (!getData.success) throw new Error(getData.msg || "Universal Delete: Failed to parse inbound");

  const inbound = getData.obj;

  // Safely parse settings whether it's a string or already an object
  const settings = typeof inbound.settings === "string"
    ? JSON.parse(inbound.settings)
    : inbound.settings;

  const initialCount = settings.clients.length;
  settings.clients = settings.clients.filter((c: any) => c.id !== uuid && c.password !== uuid);

  // Client is already gone — treat as success
  if (settings.clients.length === initialCount) return;

  // Must stringify before sending back
  inbound.settings = JSON.stringify(settings);

  const updateRes = await fetch(`${cleanUrl}/panel/api/inbounds/update/${inboundId}`, {
    method: "POST",
    headers: { ...headersWithCsrf, "Content-Type": "application/json" },
    body: JSON.stringify(inbound)
  });

  const updateData = await safeJson(updateRes);
  if (!updateRes.ok || !updateData.success) {
    throw new Error(updateData.msg || `Universal Delete Update failed (Status ${updateRes.status})`);
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

/**
 * Fetches all clients from a specific inbound in 3x-ui.
 */
export async function fetch3xuiUsers(
  apiUrl: string,
  cookie: string,
  inboundId: number
): Promise<{ id: string; email: string }[]> {
  const cleanUrl = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${cleanUrl}/panel/api/inbounds/get/${inboundId}`, {
    method: "GET",
    headers: { "Cookie": cookie }
  });
  
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.success) return [];
  
  try {
    const settings = JSON.parse(data.obj.settings);
    return settings.clients || [];
  } catch {
    return [];
  }
}
