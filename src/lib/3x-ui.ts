import https from "https";

// Helper to make generic requests
function makeRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; headers: any; data: any }> {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method,
        headers,
        rejectUnauthorized: false, // For self-signed certs
      };

      const req = urlObj.protocol === "https:" 
        ? https.request(options, handleResponse)
        : require("http").request(options, handleResponse);

      function handleResponse(res: any) {
        let data = "";
        res.on("data", (chunk: any) => (data += chunk));
        res.on("end", () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            // Ignore
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }

      req.on("error", (err: any) => reject(err));
      
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error("Timeout"));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function login3xui(apiUrl: string, username?: string, password?: string): Promise<string> {
  const body = JSON.stringify({ username, password });
  const res = await makeRequest(`${apiUrl}/login`, "POST", {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body).toString(),
  }, body);

  if (res.status !== 200 || !res.data.success) {
    throw new Error(res.data?.msg || "Login failed");
  }

  // Extract session cookie
  const cookies = res.headers["set-cookie"];
  if (!cookies || cookies.length === 0) {
    throw new Error("No session cookie returned");
  }

  return cookies[0].split(";")[0]; // returns "session=..."
}

export async function addClient3xui(
  apiUrl: string,
  cookie: string,
  inboundId: number,
  clientEmail: string,
  uuid: string
): Promise<void> {
  // 1. First, we need to fetch the existing inbound to append the client
  const getRes = await makeRequest(`${apiUrl}/panel/api/inbounds/get/${inboundId}`, "GET", {
    "Cookie": cookie,
  });

  if (getRes.status !== 200 || !getRes.data.success) {
    throw new Error("Failed to get inbound");
  }

  const inbound = getRes.data.obj;
  const settings = JSON.parse(inbound.settings);
  
  // Check if client already exists
  if (settings.clients.some((c: any) => c.email === clientEmail)) {
    return; // Already exists
  }

  // Define new client
  const newClient = {
    id: uuid,
    alterId: 0,
    email: clientEmail,
    limitIp: 0,
    totalGB: 0,
    expiryTime: 0,
    enable: true,
    tgId: "",
    subId: uuid,
  };

  // AddClient API directly adds the client to the inbound settings
  const addBody = JSON.stringify({
    id: inboundId,
    settings: JSON.stringify({ clients: [newClient] })
  });

  const addRes = await makeRequest(`${apiUrl}/panel/api/inbounds/addClient`, "POST", {
    "Content-Type": "application/json",
    "Cookie": cookie,
    "Content-Length": Buffer.byteLength(addBody).toString(),
  }, addBody);

  if (addRes.status !== 200 || !addRes.data.success) {
    throw new Error(addRes.data.msg || "Failed to add client");
  }
}

export async function deleteClient3xui(
  apiUrl: string,
  cookie: string,
  inboundId: number,
  uuid: string
): Promise<void> {
  // UUID is often used to delete in 3x-ui API
  const delRes = await makeRequest(`${apiUrl}/panel/api/inbounds/${inboundId}/delClient/${uuid}`, "POST", {
    "Cookie": cookie,
  });

  if (delRes.status !== 200 || !delRes.data.success) {
    throw new Error(delRes.data.msg || "Failed to delete client");
  }
}

export async function getClientTraffics(apiUrl: string, cookie: string): Promise<any[]> {
  const res = await makeRequest(`${apiUrl}/panel/api/inbounds/clientTraffics`, "GET", {
    "Cookie": cookie,
  });

  if (res.status !== 200 || !res.data.success) {
    throw new Error("Failed to get traffics");
  }

  return res.data.obj;
}
