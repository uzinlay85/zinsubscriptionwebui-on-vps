import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { setOutlineDataLimit } from "@/lib/outline";
import https from "https";

// Helper to fetch Outline metrics
async function fetchOutlineMetrics(apiUrl: string): Promise<Record<string, number>> {
  return new Promise((resolve) => {
    try {
      const url = new URL(`${apiUrl}/metrics/transfer`);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "GET",
        rejectUnauthorized: false,
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.bytesTransferredByUserId || {});
          } catch {
            resolve({});
          }
        });
      });
      req.setTimeout(3000, () => {
        req.destroy();
        resolve({});
      });
      req.on("error", () => resolve({}));
      req.end();
    } catch {
      resolve({});
    }
  });
}

// Helper to fetch 3x-ui metrics
async function fetch3xuiMetrics(server: any): Promise<Record<string, number>> {
  try {
    const { login3xui } = await import("@/lib/3x-ui");
    const finalUsername = server.username || server.auth_username;
    const finalPassword = server.password || server.auth_password;
    const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
    
    const cleanUrl = server.api_url.replace(/\/$/, "");
    const res = await fetch(`${cleanUrl}/panel/api/inbounds/getClientTraffics`, {
      headers: { "Cookie": cookie, "Accept": "application/json" }
    });
    
    if (!res.ok) return {};
    const json = await res.json();
    if (!json.success || !json.obj) return {};
    
    const metrics: Record<string, number> = {};
    // json.obj is an array of { id, inboundId, enable, email, up, down, expiryTime, total, reset }
    json.obj.forEach((client: any) => {
      // 3x-ui uses email as the identifier. We usually set email to "client.name" or "server.name - client.name"
      metrics[client.email] = (client.up || 0) + (client.down || 0);
    });
    return metrics;
  } catch (e) {
    console.error("Failed to fetch 3x-ui metrics", e);
    return {};
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // 1. Fetch all clients that are currently active (including unlimited ones to sync usage stats)
    const { data: clientsData, error: clientsError } = await supabase
      .from("clients")
      .select("*")
      .eq("status", "active");

    if (clientsError) {
      console.error("Error fetching clients for sync:", clientsError);
      return new NextResponse(clientsError.message, { status: 500 });
    }

    if (!clientsData || clientsData.length === 0) {
      return NextResponse.json({ success: true, message: "No active clients found." });
    }

    // 2. Fetch all keys for these clients
    const clientIds = clientsData.map(c => c.id);
    const { data: keysData, error: keysError } = await supabase
      .from("client_keys")
      .select("*, servers(*)")
      .in("client_id", clientIds);

    if (keysError) {
      return new NextResponse(keysError.message, { status: 500 });
    }

    const keys = (keysData as any[]) || [];

    // 3. Group keys by server to minimize API requests
    const serversMap = new Map<string, any>();
    keys.forEach(k => {
      if (k.servers) serversMap.set(k.servers.id, k.servers);
    });

    const serverMetricsMap = new Map<string, Record<string, number>>();

    // 4. Fetch metrics from each server
    await Promise.all(
      Array.from(serversMap.values()).map(async (server) => {
        if (server.type === "outline" || !server.type) {
          const metrics = await fetchOutlineMetrics(server.api_url);
          serverMetricsMap.set(server.id, metrics);
        } else if (server.type === "3x-ui") {
          const metrics = await fetch3xuiMetrics(server);
          serverMetricsMap.set(server.id, metrics);
        }
        // Hysteria2 metrics are currently not natively fetchable via simple API
      })
    );

    const clientUsageUpdates = new Map<string, number>(); // clientId -> new total usage
    const keyUpdates: Array<{ id: string, last_seen_bytes: number }> = [];

    // 5. Calculate usage deltas
    clientsData.forEach(client => {
      const clientKeys = keys.filter(k => k.client_id === client.id);
      let clientTotalUsage = client.total_usage_bytes || 0;

      clientKeys.forEach(key => {
        const server = key.servers;
        const metrics = serverMetricsMap.get(server.id) || {};
        
        let currentBytes = 0;
        if (server.type === "outline" || !server.type) {
          currentBytes = metrics[key.outline_key_id] || 0;
        } else if (server.type === "3x-ui") {
          const keyName = `${server.name} - ${client.name}`;
          currentBytes = metrics[keyName] || metrics[client.name] || metrics[key.uuid] || 0;
        }

        const lastSeenBytes = key.last_seen_bytes || 0;
        let delta = 0;

        if (currentBytes < lastSeenBytes) {
          // Server rebooted or usage reset
          delta = currentBytes;
        } else {
          delta = currentBytes - lastSeenBytes;
        }

        if (delta > 0) {
          clientTotalUsage += delta;
          keyUpdates.push({ id: key.id, last_seen_bytes: currentBytes });
        }
      });

      clientUsageUpdates.set(client.id, clientTotalUsage);
    });

    // 6. Update usage in database
    let suspendedCount = 0;

    await Promise.all(
      clientsData.map(async (client) => {
        const newTotal = clientUsageUpdates.get(client.id) || client.total_usage_bytes;
        const dataLimitBytes = (client.data_limit_gb || 0) * 1024 * 1024 * 1024;

        let status = client.status;
        if (dataLimitBytes > 0 && newTotal >= dataLimitBytes) {
          status = "limit_reached";
          suspendedCount++;

          // Suspend keys on servers
          const clientKeys = keys.filter(k => k.client_id === client.id);
          await Promise.allSettled(
            clientKeys.map(async (key) => {
              const server = key.servers;
              if (server.type === "outline" || !server.type) {
                try { await setOutlineDataLimit(server.api_url, key.outline_key_id, 1); } catch (e) {}
              } else if (server.type === "3x-ui") {
                 // In future, disable 3x-ui client via API. For now, it will be marked limit_reached in DB
                 // which is a good first step.
              } else if (server.type === "hysteria2") {
                 // Hysteria2 doesn't support data limit easily.
              }
            })
          );
        }

        await supabase
          .from("clients")
          .update({ total_usage_bytes: newTotal, status })
          .eq("id", client.id);
      })
    );

    // Update keys last seen
    for (const kUpdate of keyUpdates) {
      await supabase
        .from("client_keys")
        .update({ last_seen_bytes: kUpdate.last_seen_bytes })
        .eq("id", kUpdate.id);
    }

    return NextResponse.json({ 
      success: true, 
      processedClients: clientsData.length,
      suspendedClients: suspendedCount,
      updatedKeys: keyUpdates.length
    });

  } catch (error: any) {
    console.error("Cron sync usage check failed:", error);
    return new NextResponse(error.message, { status: 500 });
  }
}
