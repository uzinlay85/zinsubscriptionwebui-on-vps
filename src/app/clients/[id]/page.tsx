import { supabaseAdmin } from "@/lib/supabase-server";
import { AddClientKeyForm } from "./AddClientKeyForm";
import { SyncClientButton } from "./SyncClientButton";
import { ResetUsageButton } from "./ResetUsageButton";
import { ClientKeysList } from "./ClientKeysList";
import { ArrowLeft, Server, Key, Activity, BarChart3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import https from "https";

export const revalidate = 0;

// Fetch metrics from Outline API for a given server
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

// Convert bytes to readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Fetch client details
  const { data, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();
    
  const client = data as any;

  if (clientError || !client) {
    notFound();
  }

  // Fetch client keys with associated server data
  const { data: keysData } = await supabaseAdmin
    .from("client_keys")
    .select("*, servers(*)")
    .eq("client_id", id)
    .order("created_at", { ascending: false });
    
  const clientKeys = keysData as any[];

  // Fetch all servers for the dropdown
  const { data: serversData } = await supabaseAdmin.from("servers").select("id, name");
  const servers = serversData as any[];

  // Fetch usage metrics from each unique server's Outline API
  const usageMap: Record<string, number> = {};
  const uniqueServers = new Map<string, any>();
  clientKeys?.forEach((key) => {
    if (key.servers?.id) uniqueServers.set(key.servers.id, key.servers);
  });

  await Promise.all(
    Array.from(uniqueServers.values()).map(async (server) => {
      const metrics = await fetchServerMetrics(server.api_url);
      Object.entries(metrics).forEach(([keyId, bytes]) => {
        usageMap[`${server.id}:${keyId}`] = bytes as number;
      });
    })
  );

  // Calculate total usage for this client
  const totalBytes = clientKeys?.reduce((sum, key) => {
    return sum + (usageMap[`${key.server_id}:${key.outline_key_id}`] || 0);
  }, 0) || 0;

  return (
    <div className="space-y-6 animate-in">
      <Link href="/clients" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
        <ArrowLeft size={16} />
        Back to Clients
      </Link>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            {client.name}
            <span className={`text-sm px-2.5 py-0.5 rounded-full ${
              client.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 
              client.status === 'limit_reached' ? 'bg-orange-500/10 text-orange-400' :
              'bg-zinc-800 text-zinc-400'
            }`}>
              {client.status === 'limit_reached' ? 'DATA LIMIT REACHED' : client.status.toUpperCase()}
            </span>
            {client.expiry_date && (
              <span className={`text-sm px-2.5 py-0.5 rounded-full ${new Date(client.expiry_date) < new Date() ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-blue-500/10 text-blue-400'}`}>
                {new Date(client.expiry_date) < new Date() ? "EXPIRED" : `Valid till ${new Date(client.expiry_date).toLocaleDateString()}`}
              </span>
            )}
          </h1>
          <p className="text-zinc-400 mt-2 font-mono text-sm bg-white/5 inline-block px-3 py-1 rounded-lg">
            Subscription Token: {client.sub_token}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ResetUsageButton clientId={client.id} />
          <SyncClientButton clientId={client.id} />
          <AddClientKeyForm clientId={client.id} servers={servers || []} />
        </div>
      </div>

      {/* Total Usage Card */}
      <div className="glass-card p-5 flex flex-col gap-4 border-purple-500/20">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-sm text-zinc-400">Total Data Usage</p>
            <p className="text-2xl font-bold text-white">
              {client.data_limit_gb 
                ? formatBytes(client.total_usage_bytes || 0) 
                : formatBytes(totalBytes)}
              {client.data_limit_gb && (
                <span className="text-sm font-normal text-zinc-500 ml-2">
                  / {client.data_limit_gb} GB
                </span>
              )}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm text-zinc-500">{clientKeys?.length || 0} active keys</p>
            <p className="text-xs text-zinc-600 mt-1">
              {client.data_limit_gb ? "Synced via Cron" : "Live from Outline API"}
            </p>
          </div>
        </div>

        {/* Progress Bar for Data Limit */}
        {client.data_limit_gb && (
          <div className="w-full mt-2">
            <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
              <span>Usage Progress</span>
              <span>
                {Math.min((((client.total_usage_bytes || 0) / (client.data_limit_gb * 1024 * 1024 * 1024)) * 100), 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  (client.total_usage_bytes || 0) >= client.data_limit_gb * 1024 * 1024 * 1024 
                    ? 'bg-red-500' 
                    : 'bg-gradient-to-r from-emerald-500 to-purple-500'
                }`}
                style={{ width: `${Math.min((((client.total_usage_bytes || 0) / (client.data_limit_gb * 1024 * 1024 * 1024)) * 100), 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <h2 className="text-xl font-semibold text-white mb-6 border-b border-white/10 pb-4">Assigned Servers</h2>
        
        <ClientKeysList clientKeys={clientKeys || []} initialUsageMap={usageMap} clientId={client.id} />
      </div>
    </div>
  );
}

