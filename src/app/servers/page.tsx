import { supabaseAdmin } from "@/lib/supabase-server";
import { AddServerForm } from "./AddServerForm";
import { ServersClient } from "./ServersClient";

export const revalidate = 0;

export default async function ServersPage() {
  const { data } = await supabaseAdmin
    .from("servers")
    .select("*")
    .order("created_at", { ascending: false });

  const servers = (data as any[]) ?? [];

  // Fetch active clients for the Sync modal client selection
  const { data: clientsData } = await supabaseAdmin
    .from("clients")
    .select("id, name, status")
    .order("name", { ascending: true });

  const clients = (clientsData as any[]) ?? [];

  return (
    <div className="space-y-6 animate-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">VPN Servers</h1>
          <p className="text-zinc-400 mt-1">Manage your VPN servers and API keys.</p>
        </div>
        <AddServerForm />
      </div>

      <ServersClient servers={servers} clients={clients} />
    </div>
  );
}
