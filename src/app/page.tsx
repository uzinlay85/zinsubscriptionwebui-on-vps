import { supabase } from "@/lib/supabase";
import { Server, Users, Key } from "lucide-react";

export default async function DashboardOverview() {
  // Fetch statistics
  const [{ count: serversCount }, { count: clientsCount }, { count: keysCount }] = await Promise.all([
    supabase.from("servers").select("*", { count: "exact", head: true }),
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase.from("client_keys").select("*", { count: "exact", head: true })
  ]);

  const stats = [
    { title: "Total Servers", value: serversCount || 0, icon: Server, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Total Clients", value: clientsCount || 0, icon: Users, color: "text-purple-500", bg: "bg-purple-500/10" },
    { title: "Active Keys", value: keysCount || 0, icon: Key, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  return (
    <div className="space-y-8 animate-in">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Dashboard</h1>
          <p className="text-zinc-400">Welcome to your Outline Subscription Panel.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="glass-card p-6 flex items-start gap-4 hover:border-white/10 transition-colors">
              <div className={`p-4 rounded-2xl ${stat.bg} ${stat.color}`}>
                <Icon size={24} />
              </div>
              <div>
                <p className="text-zinc-400 font-medium mb-1">{stat.title}</p>
                <h3 className="text-3xl font-bold text-white">{stat.value}</h3>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-8 text-center mt-12">
        <h2 className="text-2xl font-semibold text-white mb-4">Quick Setup Guide</h2>
        <p className="text-zinc-400 max-w-2xl mx-auto mb-8">
          To start providing Outline VPN access, first add a Server from your Outline Manager. Then create a Client to generate their unique subscription link. Finally, assign the client to the server to generate their access keys.
        </p>
        <div className="flex items-center justify-center gap-4">
          <a href="/servers" className="px-6 py-3 rounded-full bg-primary hover:bg-blue-600 text-white font-medium transition-colors">
            Manage Servers
          </a>
          <a href="/clients" className="px-6 py-3 rounded-full bg-white/5 hover:bg-white/10 text-white font-medium transition-colors border border-white/10">
            Manage Clients
          </a>
        </div>
      </div>
    </div>
  );
}
