import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { fetchOutlineMetrics } from "@/lib/outline";

export const dynamic = "force-dynamic";

async function fetchServerMetricsFormatted(server: any, clientKeys: any[]): Promise<Record<string, number>> {
  const metrics: Record<string, number> = {};
  
  if (!server.type || server.type === "outline") {
    try {
      return await fetchOutlineMetrics(server.api_url);
    } catch {
      return {};
    }
  }
  
  if (server.type === "3x-ui") {
    try {
      const { login3xui, getClientTraffics } = await import("@/lib/3x-ui");
      const finalUsername = server.username || server.auth_username;
      const finalPassword = server.password || server.auth_password;
      const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
      const traffics = await getClientTraffics(server.api_url, cookie);
      
      const trafficMap: Record<string, number> = {};
      traffics.forEach((t: any) => {
        trafficMap[t.email] = (t.up || 0) + (t.down || 0);
      });
      
      clientKeys.forEach((key: any) => {
        if (key.server_id === server.id) {
          const clientName = key.clients?.name || "";
          const keyName = `${server.name} - ${clientName}`;
          
          const bytes = trafficMap[keyName] || trafficMap[clientName] || trafficMap[key.outline_key_id] || 0;
          metrics[key.outline_key_id] = bytes;
        }
      });
    } catch (e) {
      console.error(`Failed to fetch 3x-ui metrics for server ${server.id}`, e);
    }
  }
  
  if (server.type === "hysteria2" || server.type === "hysteria2_python") {
    try {
      const { loginHysteria, fetchHysteriaUsers } = await import("@/lib/hysteria2");
      const usernameParam = server.type === "hysteria2_python" ? "python_flask" : server.auth_username;
      const token = await loginHysteria(server.api_url, usernameParam, server.auth_password);
      
      if (server.type === "hysteria2_python") {
        const { loginHysteriaFlask, parseFormattedBytes } = await import("@/lib/hysteria2");
        const parsed = JSON.parse(token);
        const cookie = parsed.cookie;
        
        let base = server.api_url;
        if (base.endsWith('/')) {
          base = base.slice(0, -1);
        }
        
        const res = await fetch(`${base}/`, {
          headers: { Cookie: cookie },
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const html = await res.text();
          const rowRegex = /<tr>\s*<td>\s*<b>([^<]+)<\/b>\s*<\/td>\s*<td>\s*<code>([^<]+)<\/code>\s*<\/td>\s*<td>[\s\S]*?<\/td>\s*<td[^>]*>\s*<span class="usage-badge">⬇️\s*([^<]+)<\/span>\s*<br>\s*<span class="usage-badge"[^>]*>⬆️\s*([^<]+)<\/span>/g;
          
          let match;
          while ((match = rowRegex.exec(html)) !== null) {
            const password = match[2].trim();
            const txBytes = parseFormattedBytes(match[3]);
            const rxBytes = parseFormattedBytes(match[4]);
            metrics[password] = txBytes + rxBytes;
          }
        }
      } else {
        const users = await fetchHysteriaUsers(server.api_url, token);
        users.forEach((u: any) => {
          metrics[u.password] = (u.tx || 0) + (u.rx || 0);
        });
      }
    } catch (e) {
      console.error(`Failed to fetch Hysteria metrics for server ${server.id}`, e);
    }
  }
  
  return metrics;
}

export async function GET() {
  const { data: serversData } = await supabaseAdmin
    .from("servers")
    .select("id, name, api_url, type, username, password, auth_username, auth_password, inbound_id");
  const servers = (serversData as any[]) || [];

  const { data: keysData } = await supabaseAdmin
    .from("client_keys")
    .select("id, outline_key_id, server_id, uuid, clients(name)");
  const clientKeys = (keysData as any[]) || [];

  const metricsMap: Record<string, Record<string, number>> = {};

  await Promise.all(
    servers.map(async (server) => {
      metricsMap[server.id] = await fetchServerMetricsFormatted(server, clientKeys);
    })
  );

  return NextResponse.json({ metricsMap });
}
