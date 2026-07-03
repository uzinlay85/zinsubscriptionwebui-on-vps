"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Key, Activity, Wifi, Trash2, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Check, X, Loader2 } from "lucide-react";
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

type SortKey = "name" | "status" | "usage" | "expiry" | "created_at";
type SortDir = "asc" | "desc";

function SortButton({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active
          ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
          : "bg-white/5 text-zinc-400 border border-white/5 hover:bg-white/10 hover:text-zinc-200"
      }`}
    >
      {label}
      {active ? (
        currentDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
      ) : (
        <ArrowUpDown size={12} className="opacity-40" />
      )}
    </button>
  );
}

export function ClientList({ clients, servers, initialUsage }: { clients: any[], servers: any[], initialUsage: Record<string, number> }) {
  const [usage, setUsage] = useState<Record<string, number>>(initialUsage);
  const [lastActive, setLastActive] = useState<Record<string, number>>({});
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Restore sorting preferences
  useEffect(() => {
    try {
      const savedSortKey = localStorage.getItem("clients_sort_key") as SortKey | null;
      if (savedSortKey) setSortKey(savedSortKey);
      const savedSortDir = localStorage.getItem("clients_sort_dir") as SortDir | null;
      if (savedSortDir) setSortDir(savedSortDir);
    } catch { /* ignore */ }
  }, []);

  const handleSort = useCallback(
    (key: SortKey) => {
      const newDir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
      setSortKey(key);
      setSortDir(newDir);
      try {
        localStorage.setItem("clients_sort_key", key);
        localStorage.setItem("clients_sort_dir", newDir);
      } catch { /* ignore */ }
    },
    [sortKey, sortDir]
  );

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

            // If usage increased by more than 10 KB, mark as active
            if (prevUsage[client.id] !== undefined && (total - prevUsage[client.id]) > 10240) {
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

  const sortedClients = [...(clients || [])].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") {
      cmp = (a.name ?? "").localeCompare(b.name ?? "");
    } else if (sortKey === "status") {
      cmp = (a.status ?? "active").localeCompare(b.status ?? "active");
    } else if (sortKey === "usage") {
      const usageA = usage[a.id] || 0;
      const usageB = usage[b.id] || 0;
      cmp = usageA - usageB;
    } else if (sortKey === "expiry") {
      const timeA = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
      const timeB = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
      cmp = timeA - timeB;
    } else {
      // created_at
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      cmp = timeA - timeB;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="space-y-4">
      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap bg-white/5 border border-white/5 rounded-2xl p-3">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 mr-2">
          Clients: {clients.length}
        </span>
        <span className="text-xs text-zinc-500 font-medium mr-1">Sort clients by:</span>
        <SortButton label="Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortButton label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortButton label="Data Usage" sortKey="usage" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortButton label="Expiry Date" sortKey="expiry" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortButton label="Date Created" sortKey="created_at" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {sortedClients.map((client, index) => {
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
                  <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-purple-600 text-[10px] font-bold text-white flex items-center justify-center border border-zinc-950">
                    {index + 1}
                  </span>
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

                    {confirmDeleteId === client.id ? (
                      // Inline confirmation row — no browser alert needed
                      <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-xl px-2 py-1">
                        <AlertTriangle size={14} className="text-red-400 shrink-0" />
                        <span className="text-xs text-red-300 font-medium whitespace-nowrap">Delete?</span>
                        <button
                          disabled={isDeleting}
                          onClick={async () => {
                            setIsDeleting(true);
                            setDeleteError(null);
                            const fd = new FormData();
                            fd.set("id", client.id);
                            const res = await deleteClient(fd);
                            if (res?.error) {
                              setDeleteError(res.error);
                              setConfirmDeleteId(null);
                            } else {
                              setConfirmDeleteId(null);
                            }
                            setIsDeleting(false);
                          }}
                          className="p-1 text-red-400 hover:text-white hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
                          title="Confirm delete"
                        >
                          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setConfirmDeleteId(client.id); setDeleteError(null); }}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex justify-center"
                        title="Delete Client"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Global delete error toast */}
      {deleteError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 backdrop-blur text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in">
          <AlertTriangle size={16} />
          {deleteError}
          <button onClick={() => setDeleteError(null)} className="ml-2 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

