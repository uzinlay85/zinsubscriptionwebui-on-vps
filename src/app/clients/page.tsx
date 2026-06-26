import { supabase } from "@/lib/supabase";
import { AddClientForm } from "./AddClientForm";
import { CopyLinkButton } from "./CopyLinkButton";
import { EditClientForm } from "./EditClientForm";
import { deleteClient } from "./actions";
import { Users, Trash2, Key, Activity } from "lucide-react";
import Link from "next/link";
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
            const json = JSON.parse(data);
            resolve(json.bytesTransferredByUserId || {});
          } catch { resolve({}); }
        });
      });
      req.on("error", () => resolve({}));
      req.end();
    } catch { resolve({}); }
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function ClientsPage() {
  // Fetch clients with their keys (including server info)
  const { data } = await supabase
    .from("clients")
    .select("*, client_keys(id, outline_key_id, server_id, servers(id, api_url))")
    .order("created_at", { ascending: false });
  const clients = data as any[];

  // Collect all unique servers across all clients
  const allServers = new Map<string, { id: string; api_url: string }>();
  clients?.forEach((client) => {
    client.client_keys?.forEach((key: any) => {
      if (key.servers?.id) allServers.set(key.servers.id, key.servers);
    });
  });

  // Fetch metrics from all servers in parallel
  const metricsMap: Record<string, Record<string, number>> = {};
  await Promise.all(
    Array.from(allServers.values()).map(async (server) => {
      metricsMap[server.id] = await fetchServerMetrics(server.api_url);
    })
  );

  // Calculate total usage per client
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
        <AddClientForm />
      </div>

      <div className="grid grid-cols-1 gap-4 mt-8">
        {clients?.map((client) => {
          const keysCount = client.client_keys?.length || 0;
          const isStatusActive = client.status === 'active';
          const usage = clientUsage[client.id] || 0;

          return (
            <div key={client.id} className="glass-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-white/10 transition-colors">
              
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${isStatusActive ? 'bg-purple-500/10 text-purple-500' : 'bg-zinc-800 text-zinc-500'}`}>
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white group-hover:text-purple-400 transition-colors">
                    {client.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isStatusActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {client.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Key size={12} /> {keysCount} key{keysCount !== 1 ? 's' : ''}
                    </span>
                    {client.expiry_date && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${new Date(client.expiry_date) < new Date() ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-blue-500/10 text-blue-400'}`}>
                        {new Date(client.expiry_date) < new Date() ? "EXPIRED" : `Valid till ${new Date(client.expiry_date).toLocaleDateString()}`}
                      </span>
                    )}
                    {/* Live Usage Badge */}
                    <span className="text-xs flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-mono font-medium">
                      <Activity size={11} />
                      {formatBytes(usage)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <CopyLinkButton token={client.sub_token} name={client.name} />

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Link 
                    href={`/clients/${client.id}`}
                    className="flex-1 sm:flex-none text-center px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    Manage Keys
                  </Link>

                  <EditClientForm client={{ id: client.id, name: client.name, expiry_date: client.expiry_date }} />

                  <form action={async () => {
                    "use server";
                    await deleteClient(client.id);
                  }}>
                    <button type="submit" className="text-zinc-500 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-xl transition-colors" title="Delete Client">
                      <Trash2 size={18} />
                    </button>
                  </form>
                </div>
              </div>

            </div>
          );
        })}

        {(!clients || clients.length === 0) && (
          <div className="glass-card p-12 text-center flex flex-col items-center justify-center border-dashed border-white/10">
            <div className="p-4 bg-white/5 rounded-full mb-4">
              <Users size={32} className="text-zinc-500" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No clients found</h3>
            <p className="text-zinc-400 max-w-md">Add a client to generate subscription links and assign them to servers.</p>
          </div>
        )}
      </div>
    </div>
  );
}

