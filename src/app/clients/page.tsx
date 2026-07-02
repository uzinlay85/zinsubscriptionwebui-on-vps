import { supabaseAdmin } from "@/lib/supabase-server";
import { AddClientForm } from "./AddClientForm";
import { ClientList } from "./ClientList";
import https from "https";

export const revalidate = 0;

async function fetchServerMetrics(apiUrl: string): Promise<Record<string, number>> {
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
            const parsed = JSON.parse(data);
            resolve(parsed.bytesTransferredByUserId || {});
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

export default async function ClientsPage() {
  // Fetch all servers for the Add Client form checkboxes
  const { data: allServersData } = await supabaseAdmin.from("servers").select("id, name, type");
  const allServers = (allServersData as any[]) || [];

  // Fetch clients with their keys (including server info)
  const { data } = await supabaseAdmin
    .from("clients")
    .select("*, client_keys(id, outline_key_id, server_id, servers(id, api_url, type))")
    .order("created_at", { ascending: false });
  const clients = data as any[];

  // Collect all unique servers across all clients
  const serversMap = new Map<string, { id: string; api_url: string, type?: string }>();
  clients?.forEach((client) => {
    client.client_keys?.forEach((key: any) => {
      if (key.servers?.id) serversMap.set(key.servers.id, key.servers);
    });
  });

  const serversList = Array.from(serversMap.values());

  // Fetch metrics from all servers in parallel
  const metricsMap: Record<string, Record<string, number>> = {};
  await Promise.all(
    serversList.map(async (server) => {
      if (!server.type || server.type === "outline") {
        metricsMap[server.id] = await fetchServerMetrics(server.api_url);
      }
    })
  );

  // Calculate total initial usage per client
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
