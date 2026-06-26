import { supabase } from "@/lib/supabase";
import { AddClientForm } from "./AddClientForm";
import { CopyLinkButton } from "./CopyLinkButton";
import { EditClientForm } from "./EditClientForm";
import { Users, Trash2, Key } from "lucide-react";
import Link from "next/link";

export const revalidate = 0; // Disable caching

export default async function ClientsPage() {
  // Fetch clients and count their keys
  const { data, error } = await supabase
    .from("clients")
    .select("*, client_keys(count)")
    .order("created_at", { ascending: false });
  const clients = data as any[];

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
          const keysCount = client.client_keys?.[0]?.count || 0;
          const isStatusActive = client.status === 'active';
          
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
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isStatusActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {client.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Key size={12} /> {keysCount} active keys
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <CopyLinkButton token={client.sub_token} />

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Link 
                    href={`/clients/${client.id}`}
                    className="flex-1 sm:flex-none text-center px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    Manage Keys
                  </Link>

                  <EditClientForm client={{ id: client.id, name: client.name }} />

                  <form action={async () => {
                    "use server";
                    await supabase.from("clients").delete().eq("id", client.id);
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
