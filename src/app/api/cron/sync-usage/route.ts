import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { setOutlineDataLimit, fetchOutlineMetrics } from "@/lib/outline";

// Helper to fetch 3x-ui metrics
async function fetch3xuiMetrics(server: any): Promise<Record<string, number>> {
  try {
    const { login3xui } = await import("@/lib/3x-ui");
    const finalUsername = server.username || server.auth_username;
    const finalPassword = server.password || server.auth_password;
    const cookie = await login3xui(server.api_url, finalUsername, finalPassword);

    const cleanUrl = server.api_url.replace(/\/$/, "");
    const res = await fetch(`${cleanUrl}/panel/api/inbounds/getClientTraffics`, {
      headers: { Cookie: cookie, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return {};
    const json = await res.json();
    if (!json.success || !json.obj) return {};

    const metrics: Record<string, number> = {};
    json.obj.forEach((client: any) => {
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
  const cronSecret = process.env.CRON_SECRET;

  // CRON_SECRET is required — reject if missing or wrong
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // 1. Fetch all active clients
    const { data: clientsData, error: clientsError } = await supabaseAdmin
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
    const clientIds = clientsData.map((c) => c.id);
    const { data: keysData, error: keysError } = await supabaseAdmin
      .from("client_keys")
      .select("*, servers(*)")
      .in("client_id", clientIds);

    if (keysError) {
      return new NextResponse(keysError.message, { status: 500 });
    }

    const keys = (keysData as any[]) || [];

    // 3. Group keys by server to minimize API requests
    const serversMap = new Map<string, any>();
    keys.forEach((k) => {
      if (k.servers) serversMap.set(k.servers.id, k.servers);
    });

    const serverMetricsMap = new Map<string, Record<string, number>>();

    // 4. Fetch metrics from each server in parallel
    await Promise.all(
      Array.from(serversMap.values()).map(async (server) => {
        if (server.type === "outline" || !server.type) {
          serverMetricsMap.set(server.id, await fetchOutlineMetrics(server.api_url));
        } else if (server.type === "3x-ui") {
          serverMetricsMap.set(server.id, await fetch3xuiMetrics(server));
        }
        // Hysteria2 metrics not natively fetchable
      })
    );

    const clientUsageUpdates = new Map<string, number>();
    const keyUpdates: Array<{ id: string; last_seen_bytes: number }> = [];

    // 5. Calculate usage deltas
    clientsData.forEach((client) => {
      const clientKeys = keys.filter((k) => k.client_id === client.id);
      let clientTotalUsage = client.total_usage_bytes || 0;

      clientKeys.forEach((key) => {
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
        let shouldUpdateLastSeen = false;

        if (currentBytes < lastSeenBytes) {
          // Server reboot / reset detection (>10% drop = real reset)
          if (currentBytes < lastSeenBytes * 0.9) {
            delta = currentBytes;
            shouldUpdateLastSeen = true;
          }
          // else: minor API fluctuation, ignore
        } else {
          delta = currentBytes - lastSeenBytes;
          if (delta > 0) shouldUpdateLastSeen = true;
        }

        if (delta > 0) clientTotalUsage += delta;
        if (shouldUpdateLastSeen) keyUpdates.push({ id: key.id, last_seen_bytes: currentBytes });
      });

      clientUsageUpdates.set(client.id, clientTotalUsage);
    });

    // 6. Update usage in database and suspend over-limit clients
    let suspendedCount = 0;

    await Promise.all(
      clientsData.map(async (client) => {
        const newTotal = clientUsageUpdates.get(client.id) ?? client.total_usage_bytes;
        const dataLimitBytes = (client.data_limit_gb || 0) * 1024 * 1024 * 1024;

        let status = client.status;
        if (dataLimitBytes > 0 && newTotal >= dataLimitBytes) {
          status = "limit_reached";
          suspendedCount++;

          // Block on Outline servers
          const clientKeys = keys.filter((k) => k.client_id === client.id);
          await Promise.allSettled(
            clientKeys.map(async (key) => {
              const server = key.servers;
              if (server.type === "outline" || !server.type) {
                try {
                  await setOutlineDataLimit(server.api_url, key.outline_key_id, 1);
                } catch {}
              }
              // 3x-ui / hysteria2: blocked via status in DB (dummy node shown in sub link)
            })
          );
        }

        await supabaseAdmin
          .from("clients")
          .update({ total_usage_bytes: newTotal, status })
          .eq("id", client.id);
      })
    );

    // 7. Batch update last_seen_bytes for keys
    await Promise.all(
      keyUpdates.map((kUpdate) =>
        supabaseAdmin
          .from("client_keys")
          .update({ last_seen_bytes: kUpdate.last_seen_bytes })
          .eq("id", kUpdate.id)
      )
    );

    return NextResponse.json({
      success: true,
      processedClients: clientsData.length,
      suspendedClients: suspendedCount,
      updatedKeys: keyUpdates.length,
    });
  } catch (error: any) {
    console.error("Cron sync usage check failed:", error);
    return new NextResponse(error.message, { status: 500 });
  }
}
