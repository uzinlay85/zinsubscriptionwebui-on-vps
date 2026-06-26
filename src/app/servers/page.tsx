import { supabase } from "@/lib/supabase";
import { AddServerForm } from "./AddServerForm";
import { EditServerForm } from "./EditServerForm";
import { deleteServer } from "./actions";
import { SyncServerButton } from "./SyncServerButton";
import { Server as ServerIcon, Trash2, Activity } from "lucide-react";

export const revalidate = 0; // Disable caching to always get fresh data

export default async function ServersPage() {
  const { data, error } = await supabase.from("servers").select("*").order("created_at", { ascending: false });
  const servers = data as any[];

  return (
    <div className="space-y-6 animate-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Outline Servers</h1>
          <p className="text-zinc-400 mt-1">Manage your Outline servers and API keys.</p>
        </div>
        <AddServerForm />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {servers?.map((server) => (
          <div key={server.id} className="glass-card p-5 flex flex-col group">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                  <ServerIcon size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">{server.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                    <Activity size={12} />
                    <span>Online</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-2 mt-2 flex-1">
              <div>
                <p className="text-xs text-zinc-500 mb-1">{server.type === "hysteria2" ? "Web UI Base URL" : "API URL"}</p>
                <p className="text-sm text-zinc-300 font-mono truncate bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">{server.api_url}</p>
              </div>
              {server.type === "outline" || !server.type ? (
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Cert SHA-256</p>
                  <p className="text-sm text-zinc-300 font-mono truncate bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">{server.cert_sha256}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Admin User</p>
                    <p className="text-sm text-zinc-300 font-mono truncate bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">{server.auth_username}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Admin Pass</p>
                    <p className="text-sm text-zinc-300 font-mono truncate bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">••••••</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4 sm:mt-0 w-full sm:w-auto">
              <SyncServerButton serverId={server.id} />
              <EditServerForm server={server} />
              <form action={async () => {
                "use server";
                await deleteServer(server.id);
              }}>
                <button type="submit" className="text-zinc-500 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-lg transition-colors" title="Delete Server">
                  <Trash2 size={16} />
                </button>
              </form>
            </div>
          </div>
        ))}

        {(!servers || servers.length === 0) && (
          <div className="col-span-full glass-card p-12 text-center flex flex-col items-center justify-center border-dashed border-white/10">
            <div className="p-4 bg-white/5 rounded-full mb-4">
              <ServerIcon size={32} className="text-zinc-500" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No servers found</h3>
            <p className="text-zinc-400 max-w-md">You haven't added any Outline servers yet. Click the "Add Server" button to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
