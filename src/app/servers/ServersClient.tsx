"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Server as ServerIcon,
  Trash2,
  Activity,
  LayoutGrid,
  List,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Globe,
  User,
  Hash,
} from "lucide-react";
import { ScanOrphanKeysButton } from "./ScanOrphanKeysButton";
import { SyncServerButton } from "./SyncServerButton";
import { EditServerForm } from "./EditServerForm";
import { deleteServer } from "./actions";

type Server = Record<string, any>;
type SortKey = "name" | "type" | "created_at";
type SortDir = "asc" | "desc";

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  outline: { label: "Outline", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  hysteria2: { label: "Hysteria2", color: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  "3x-ui": { label: "3x-UI", color: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
};

function TypeBadge({ type }: { type: string }) {
  const t = TYPE_LABEL[type] ?? { label: type ?? "Outline", color: "bg-zinc-700/50 text-zinc-300 border-zinc-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${t.color}`}>
      {t.label}
    </span>
  );
}

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
          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
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

function ServerStatusBadge({
  status,
  loading,
}: {
  status?: { online: boolean; latency?: number };
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-medium bg-white/5 border border-white/5 px-2 py-0.5 rounded-full">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400/40 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-zinc-500"></span>
        </span>
        <span className="animate-pulse text-zinc-500">Checking...</span>
      </div>
    );
  }

  const isOnline = status?.online ?? false;
  const latency = status?.latency;

  if (isOnline) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
        </span>
        <span>Online</span>
        {latency !== undefined && (
          <span className="text-[10px] text-emerald-500/70 font-mono font-medium">
            {latency}ms
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-red-400 font-semibold bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400/50 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
      </span>
      <span>Offline</span>
    </div>
  );
}

function ServerCardView({
  server,
  index,
  status,
  loading,
  clients = [],
}: {
  server: Server;
  index: number;
  status?: { online: boolean; latency?: number };
  loading: boolean;
  clients?: any[];
}) {
  return (
    <div className="glass-card p-5 flex flex-col group">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl relative">
            <ServerIcon size={20} />
            <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center border border-zinc-950">
              {index + 1}
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">
              {server.name}
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <ServerStatusBadge status={status} loading={loading} />
              <TypeBadge type={server.type ?? "outline"} />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 mt-2 flex-1">
        <div>
          <p className="text-xs text-zinc-500 mb-1">
            {server.type === "hysteria2"
              ? "Web UI Base URL"
              : server.type === "3x-ui"
              ? "Panel URL"
              : "API URL"}
          </p>
          <p className="text-sm text-zinc-300 font-mono truncate bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
            {server.api_url}
          </p>
        </div>
        {server.type === "outline" || !server.type ? (
          <div>
            <p className="text-xs text-zinc-500 mb-1">Cert SHA-256</p>
            <p className="text-sm text-zinc-300 font-mono truncate bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
              {server.cert_sha256}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-zinc-500 mb-1">
                {server.type === "3x-ui" ? "Panel User" : "Admin User"}
              </p>
              <p className="text-sm text-zinc-300 font-mono truncate bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
                {server.auth_username || server.username || ""}
              </p>
            </div>
            {server.type === "3x-ui" ? (
              <div>
                <p className="text-xs text-zinc-500 mb-1">Inbound ID</p>
                <p className="text-sm text-zinc-300 font-mono truncate bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
                  {server.inbound_id}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-zinc-500 mb-1">Admin Pass</p>
                <p className="text-sm text-zinc-300 font-mono truncate bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
                  ••••••
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 flex justify-end items-center gap-2">
        <ScanOrphanKeysButton serverId={server.id} serverName={server.name} />
        <SyncServerButton serverId={server.id} clients={clients} />
        <EditServerForm server={server} />
        <DeleteServerButton serverId={server.id} serverName={server.name} />
      </div>
    </div>
  );
}

function ServerListRow({
  server,
  index,
  status,
  loading,
  clients = [],
}: {
  server: Server;
  index: number;
  status?: { online: boolean; latency?: number };
  loading: boolean;
  clients?: any[];
}) {
  return (
    <div className="glass-card px-4 py-3 flex items-center gap-4 group hover:border-white/10 transition-all">
      <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl shrink-0 relative">
        <ServerIcon size={18} />
        <span className="absolute -top-1.5 -left-1.5 w-4.5 h-4.5 rounded-full bg-blue-600 text-[9px] font-bold text-white flex items-center justify-center border border-zinc-950">
          {index + 1}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white group-hover:text-primary transition-colors truncate">
            {server.name}
          </span>
          <TypeBadge type={server.type ?? "outline"} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500 flex-wrap">
          <span className="flex items-center gap-1">
            <Globe size={10} />
            <span className="font-mono truncate max-w-[220px]">{server.api_url}</span>
          </span>
          {(server.auth_username || server.username) && (
            <span className="flex items-center gap-1">
              <User size={10} />
              {server.auth_username || server.username}
            </span>
          )}
          {server.inbound_id != null && (
            <span className="flex items-center gap-1">
              <Hash size={10} />
              Inbound {server.inbound_id}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 hidden sm:flex items-center">
        <ServerStatusBadge status={status} loading={loading} />
      </div>

      <div className="shrink-0 flex items-center gap-1">
        <ScanOrphanKeysButton serverId={server.id} serverName={server.name} />
        <SyncServerButton serverId={server.id} clients={clients} />
        <EditServerForm server={server} />
        <DeleteServerButton serverId={server.id} serverName={server.name} />
      </div>
    </div>
  );
}

function DeleteServerButton({ serverId, serverName }: { serverId: string; serverName: string }) {
  const handleDelete = async () => {
    if (!confirm(`Delete server "${serverName}"? This cannot be undone.`)) return;
    const { deleteServer: del } = await import("./actions");
    await del(serverId);
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="text-zinc-500 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-lg transition-colors"
      title="Delete Server"
    >
      <Trash2 size={16} />
    </button>
  );
}

export function ServersClient({ servers: initialServers, clients = [] }: { servers: Server[]; clients?: Record<string, any>[] }) {
  const [view, setView] = useState<"card" | "list">("card");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statuses, setStatuses] = useState<Record<string, { online: boolean; latency?: number }>>({});
  const [loadingStatuses, setLoadingStatuses] = useState<boolean>(true);

  useEffect(() => {
    try {
      const savedView = localStorage.getItem("servers_view") as "card" | "list" | null;
      if (savedView) setView(savedView);
      const savedSortKey = localStorage.getItem("servers_sort_key") as SortKey | null;
      if (savedSortKey) setSortKey(savedSortKey);
      const savedSortDir = localStorage.getItem("servers_sort_dir") as SortDir | null;
      if (savedSortDir) setSortDir(savedSortDir);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let active = true;
    const fetchStatuses = async () => {
      try {
        const res = await fetch("/api/servers/status");
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.statuses) {
          setStatuses(data.statuses);
          setLoadingStatuses(false);
        }
      } catch (err) {
        console.error("Failed to fetch server statuses:", err);
      }
    };

    fetchStatuses();
    const interval = setInterval(fetchStatuses, 20000); // Check every 20 seconds
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleSetView = (v: "card" | "list") => {
    setView(v);
    try { localStorage.setItem("servers_view", v); } catch { /* ignore */ }
  };

  const handleSort = useCallback(
    (key: SortKey) => {
      const newDir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
      setSortKey(key);
      setSortDir(newDir);
      try {
        localStorage.setItem("servers_sort_key", key);
        localStorage.setItem("servers_sort_dir", newDir);
      } catch { /* ignore */ }
    },
    [sortKey, sortDir]
  );

  const sorted = [...initialServers].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") {
      cmp = (a.name ?? "").localeCompare(b.name ?? "");
    } else if (sortKey === "type") {
      cmp = (a.type ?? "outline").localeCompare(b.type ?? "outline");
    } else {
      cmp = new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (initialServers.length === 0) {
    return (
      <div className="glass-card p-12 text-center flex flex-col items-center justify-center border-dashed border-white/10 mt-8">
        <div className="p-4 bg-white/5 rounded-full mb-4">
          <ServerIcon size={32} className="text-zinc-500" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No servers found</h3>
        <p className="text-zinc-400 max-w-md">
          You haven&apos;t added any VPN servers yet. Click the &quot;Add Server&quot; button to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 mr-2">
            Servers: {initialServers.length}
          </span>
          <span className="text-xs text-zinc-500 font-medium mr-1">Sort:</span>
          <SortButton label="Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortButton label="Type" sortKey="type" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortButton label="Date Added" sortKey="created_at" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
        </div>

        <div className="flex items-center gap-1 bg-white/5 border border-white/5 rounded-xl p-1">
          <button
            onClick={() => handleSetView("card")}
            className={`p-2 rounded-lg transition-all ${
              view === "card" ? "bg-blue-500/20 text-blue-400" : "text-zinc-500 hover:text-zinc-300"
            }`}
            title="Card View"
            id="servers-card-view-btn"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => handleSetView("list")}
            className={`p-2 rounded-lg transition-all ${
              view === "list" ? "bg-blue-500/20 text-blue-400" : "text-zinc-500 hover:text-zinc-300"
            }`}
            title="List View"
            id="servers-list-view-btn"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {view === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((server, index) => (
            <ServerCardView
              key={server.id}
              server={server}
              index={index}
              status={statuses[server.id]}
              loading={loadingStatuses && !statuses[server.id]}
              clients={clients}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((server, index) => (
            <ServerListRow
              key={server.id}
              server={server}
              index={index}
              status={statuses[server.id]}
              loading={loadingStatuses && !statuses[server.id]}
              clients={clients}
            />
          ))}
        </div>
      )}
    </div>
  );
}