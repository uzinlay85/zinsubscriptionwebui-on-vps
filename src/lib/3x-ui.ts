// Rewrite of 3x-ui.ts using native Next.js fetch

export async function login3xui(apiUrl: string, username?: string, password?: string): Promise<string> {
  const cleanUrl = apiUrl.replace(/\/$/, "");
  const body = `username=${encodeURIComponent(username || "")}&password=${encodeURIComponent(password || "")}`;
  
  const res = await fetch(`${cleanUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json, text/plain, */*"
    },
    body: body
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || !data.success) {
    let msg = "Login failed";
    if (data && data.msg) {
      msg = data.msg;
    } else if (!res.ok) {
      msg = `Login failed with status ${res.status}`;
    }
    throw new Error(msg);
  }

  // Extract session cookie using regex
  const setCookieHeader = res.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error("No session cookie returned");
  }

  const match = setCookieHeader.match(/session=([^;]+)/);
  if (!match) {
    throw new Error("Could not parse session cookie");
  }

  return match[0]; // returns "session=..."
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
