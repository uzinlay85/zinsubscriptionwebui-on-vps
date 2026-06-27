// Rewrite of 3x-ui.ts using native Next.js fetch

export async function login3xui(apiUrl: string, username?: string, password?: string): Promise<string> {
  const cleanUrl = apiUrl.replace(/\/$/, "");
  
  const body = new URLSearchParams();
  body.append("username", username || "");
  body.append("password", password || "");

  const res = await fetch(`${cleanUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
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

  const setCookieHeader = res.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error("No session cookie returned from 3x-ui");
  }

  const match = setCookieHeader.match(/(session=[^;]+)/);
  if (match) {
    return match[1];
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
  
  // 1. Fetch the existing inbound to append the client and check protocol
  const getRes = await fetch(`${cleanUrl}/panel/api/inbounds/get/${inboundId}`, {
    method: "GET",
    headers: {
      "Cookie": cookie,
    }
  });

  const getData = await getRes.json().catch(() => null);

  if (!getRes.ok || !getData || !getData.success) {
    throw new Error("Failed to get inbound");
  }

  const inbound = getData.obj;
  const protocol = inbound.protocol;
  const settings = JSON.parse(inbound.settings);
  
  // Check if client already exists
  if (settings.clients && settings.clients.some((c: any) => c.email === clientEmail)) {
    return; // Already exists
  }

  // Define new client dynamically based on protocol
  const newClient: any = {
    email: clientEmail,
    limitIp: 0,
    totalGB: 0,
    expiryTime: 0,
    enable: true,
    tgId: "",
    subId: uuid,
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

  // AddClient API directly adds the client to the inbound settings
  const addBody = JSON.stringify({
    id: inboundId,
    settings: JSON.stringify({ clients: [newClient] })
  });

  const addRes = await fetch(`${cleanUrl}/panel/api/inbounds/addClient`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookie,
    },
    body: addBody
  });

  const addData = await addRes.json().catch(() => null);

  if (!addRes.ok || !addData || !addData.success) {
    throw new Error(addData?.msg || "Failed to add client");
  }
}

export async function deleteClient3xui(
  apiUrl: string,
  cookie: string,
  inboundId: number,
  uuid: string
): Promise<void> {
  const cleanUrl = apiUrl.replace(/\/$/, "");
  // UUID is often used to delete in 3x-ui API
  const delRes = await fetch(`${cleanUrl}/panel/api/inbounds/${inboundId}/delClient/${uuid}`, {
    method: "POST",
    headers: {
      "Cookie": cookie,
    }
  });

  const delData = await delRes.json().catch(() => null);

  if (!delRes.ok || !delData || !delData.success) {
    throw new Error(delData?.msg || "Failed to delete client");
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
