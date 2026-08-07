import { supabaseAdmin } from "@/lib/supabase-server";
import { AddClientForm } from "./AddClientForm";
import { ClientList } from "./ClientList";
import { fetchOutlineMetrics } from "@/lib/outline";

export const revalidate = 0;

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

export default async function ClientsPage() {
  const { data: allServersData } = await supabaseAdmin.from("servers").select("id, name, type");
  const allServers = (allServersData as any[]) || [];

  const { data } = await supabaseAdmin
    .from("clients")
    .select("*, client_keys(id, outline_key_id, server_id, uuid, servers(*))")
    .order("created_at", { ascending: false });
  const clients = data as any[];

  const serversMap = new Map<string, any>();
  clients?.forEach((client) => {
    client.client_keys?.forEach((key: any) => {
      if (key.servers?.id) serversMap.set(key.servers.id, key.servers);
    });
  });

  const serversList = Array.from(serversMap.values());
  
  const allClientKeys = clients.flatMap(c => 
    (c.client_keys || []).map((k: any) => ({
      ...k,
      clients: { name: c.name }
    }))
  );

  const metricsMap: Record<string, Record<string, number>> = {};
  await Promise.all(
    serversList.map(async (server) => {
      metricsMap[server.id] = await fetchServerMetricsFormatted(server, allClientKeys);
    })
  );

  const clientUsage: Record<string, number> = {};
  clients?.forEach((client) => {
    let total = 0;
    client.client_keys?.forEach((key: any) => {
      const serverId = key.servers?.id;
      if (serverId && metricsMap[serverId]) {
        total += metricsMap[serverId][key.outline_key_id] || 0;
      }
    });
    clientUsage[client.id] = total;
  });

  return (
    <div className="space-y-6 animate-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Clients</h1>
          <p className="text-zinc-400 mt-1">Manage users and their subscription links.</p>
        </div>
        <AddClientForm servers={allServers} />
      </div>
      <ClientList clients={clients || []} servers={serversList} initialUsage={clientUsage} />
    </div>
  );
}
