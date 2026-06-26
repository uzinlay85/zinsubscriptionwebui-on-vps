"use client";

import { useState, useEffect } from "react";
import { Users, Key, Activity, Wifi, Trash2 } from "lucide-react";
import Link from "next/link";
import { CopyLinkButton } from "./CopyLinkButton";
import { EditClientForm } from "./EditClientForm";
import { deleteClient } from "./actions";

// Formats bytes into a readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function ClientList({ clients, servers, initialUsage }: { clients: any[], servers: any[], initialUsage: Record<string, number> }) {
  const [usage, setUsage] = useState<Record<string, number>>(initialUsage);
  const [lastActive, setLastActive] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await fetch("/api/clients/usage");
        if (!res.ok) return;
        const data = await res.json();
        const metricsMap = data.metricsMap;

        setUsage((prevUsage) => {
          const newUsage: Record<string, number> = { ...prevUsage };
          const newLastActive: Record<string, number> = { ...lastActive };
          const now = Date.now();

          clients.forEach((client) => {
            let total = 0;
            client.client_keys?.forEach((key: any) => {
              const serverId = key.servers?.id;
              if (serverId && metricsMap[serverId]) {
                total += metricsMap[serverId][key.outline_key_id] || 0;
              }
            });

            // If usage increased, mark as active
            if (prevUsage[client.id] !== undefined && total > prevUsage[client.id]) {
              newLastActive[client.id] = now;
            }

            newUsage[client.id] = total;
          });

          setLastActive(newLastActive);
          return newUsage;
        });
      } catch (err) {
        console.error("Failed to poll usage:", err);
      }
    };

    // Poll every 15 seconds
    const interval = setInterval(fetchUsage, 15000);
    return () => clearInterval(interval);
  }, [clients, lastActive]);

  return (
    <div className="grid grid-cols-1 gap-4 mt-8">
      {clients?.map((client) => {
        const keysCount = client.client_keys?.length || 0;
        const isStatusActive = client.status === 'active';
        const clientBytes = usage[client.id] || 0;
        
        // Online if active within the last 35 seconds (allows 2 poll cycles to miss)
        const isOnline = lastActive[client.id] && (Date.now() - lastActive[client.id] < 35000);

        return (
          <div key={client.id} className="glass-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-white/10 transition-colors">
            
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl relative ${isStatusActive ? 'bg-purple-500/10 text-purple-500' : 'bg-zinc-800 text-zinc-500'}`}>
                <Users size={24} />
                {isOnline && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white group-hover:text-purple-400 transition-colors flex items-center gap-2">
                  {client.name}
                </h3>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {isOnline ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                      <Wifi size={10} /> Online
                    </span>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isStatusActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {(client.status || 'ACTIVE').toUpperCase()}
                    </span>
                  )}

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
                    {formatBytes(clientBytes)}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
              <CopyLinkButton token={client.sub_token} name={client.name} />

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Link 
                  href={`/clients/${client.id}`}
                  className="flex-1 sm:flex-none text-center px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Manage Keys
                </Link>
                
                <div className="shrink-0 flex items-center gap-1 sm:gap-2">
                  <EditClientForm client={{ id: client.id, name: client.name, expiry_date: client.expiry_date }} />

                  <form action={deleteClient} onSubmit={(e) => {
                    if (!confirm("Are you sure you want to delete this client? All their keys will also be permanently deleted. This action cannot be undone.")) {
                      e.preventDefault();
                    }
                  }} className="shrink-0 m-0 p-0 flex">
                    <input type="hidden" name="id" value={client.id} />
                    <button 
                      type="submit" 
                      className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex justify-center"
                      title="Delete Client"
                    >
                      <Trash2 size={18} />
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
