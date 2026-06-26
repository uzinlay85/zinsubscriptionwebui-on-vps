import { supabase } from "@/lib/supabase";
import { AddClientKeyForm } from "./AddClientKeyForm";
import { ArrowLeft, Key, Server, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 0;

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Fetch client details
  const { data, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();
    
  const client = data as any;

  if (clientError || !client) {
    notFound();
  }

  // Fetch client keys with associated server data
  const { data: keysData } = await supabase
    .from("client_keys")
    .select("*, servers(name)")
    .eq("client_id", id)
    .order("created_at", { ascending: false });
    
  const clientKeys = keysData as any[];

  // Fetch all servers for the dropdown
  const { data: serversData } = await supabase.from("servers").select("id, name");
  const servers = serversData as any[];

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
            <span className={`text-sm px-2.5 py-0.5 rounded-full ${client.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
              {client.status.toUpperCase()}
            </span>
          </h1>
          <p className="text-zinc-400 mt-2 font-mono text-sm bg-white/5 inline-block px-3 py-1 rounded-lg">
            Subscription Token: {client.sub_token}
          </p>
        </div>
        <AddClientKeyForm clientId={client.id} servers={servers || []} />
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-semibold text-white mb-6 border-b border-white/10 pb-4">Assigned Servers</h2>
        
        <div className="space-y-3">
          {clientKeys?.map((key) => (
            <div key={key.id} className="glass-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                  <Server size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">{(key.servers as any)?.name || "Unknown Server"}</h3>
                  <p className="text-sm text-zinc-400 mt-0.5 flex items-center gap-1">
                    <Key size={14} /> Key ID: {key.outline_key_id}
                  </p>
                </div>
              </div>
              
              <div className="w-full md:w-auto flex items-center gap-4">
                <div className="flex-1 md:flex-none">
                  <p className="text-xs text-zinc-500 mb-1">Access URL</p>
                  <p className="text-sm font-mono text-zinc-300 truncate max-w-[200px] lg:max-w-[400px] bg-white/5 px-2 py-1.5 rounded-md">
                    {key.access_url}
                  </p>
                </div>
                
                <form action={async () => {
                  "use server";
                  await supabase.from("client_keys").delete().eq("id", key.id);
                }}>
                  <button type="submit" className="text-zinc-500 hover:text-red-400 p-2 hover:bg-red-400/10 rounded-xl transition-colors mt-4 md:mt-0" title="Remove Access">
                    <Trash2 size={18} />
                  </button>
                </form>
              </div>
            </div>
          ))}

          {(!clientKeys || clientKeys.length === 0) && (
            <div className="text-center py-12 text-zinc-500">
              <Server size={32} className="mx-auto mb-3 opacity-50" />
              <p>No servers assigned yet. Assign a server to generate access keys.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
