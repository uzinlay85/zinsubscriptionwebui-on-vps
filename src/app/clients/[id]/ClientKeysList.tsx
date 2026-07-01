"use client";

import { useState, useEffect } from "react";
import { Server, Key, Activity, Wifi } from "lucide-react";
import { DeleteKeyButton } from "./DeleteKeyButton";

// Convert bytes to readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface ClientKeysListProps {
  clientKeys: any[];
  initialUsageMap: Record<string, number>;
  clientId: string;
}

export function ClientKeysList({ clientKeys, initialUsageMap, clientId }: ClientKeysListProps) {
  const [usageMap, setUsageMap] = useState<Record<string, number>>(initialUsageMap);
  const [lastActiveKeys, setLastActiveKeys] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await fetch("/api/clients/usage");
        if (!res.ok) return;
        const data = await res.json();
        const metricsMap = data.metricsMap;

        setUsageMap((prevUsage) => {
          const newUsage: Record<string, number> = { ...prevUsage };
          const newLastActiveKeys: Record<string, number> = { ...lastActiveKeys };
          const now = Date.now();

          clientKeys.forEach((key) => {
            const serverId = key.servers?.id;
            const keyId = key.outline_key_id;
            if (!serverId || !keyId) return;

            const mapKey = `${serverId}:${keyId}`;
            // Outline metrics are in metricsMap[serverId][keyId]
            const currentBytes = (metricsMap[serverId] && metricsMap[serverId][keyId]) || 0;
            const prevBytes = prevUsage[mapKey] || 0;

            // If usage increased by more than 10 KB, mark key as active
            // This filters out background ping/latency tests from VPN clients
            if (prevUsage[mapKey] !== undefined && (currentBytes - prevBytes) > 10240) {
              newLastActiveKeys[mapKey] = now;
            }

            newUsage[mapKey] = currentBytes;
          });

          setLastActiveKeys(newLastActiveKeys);
          return newUsage;
        });
      } catch (err) {
        console.error("Failed to poll keys usage:", err);
      }
    };

    // Poll every 15 seconds
    const interval = setInterval(fetchUsage, 15000);
    return () => clearInterval(interval);
  }, [clientKeys, lastActiveKeys]);

  // Recalculate totalBytes from current usageMap
  const totalBytes = clientKeys?.reduce((sum, key) => {
    return sum + (usageMap[`${key.server_id}:${key.outline_key_id}`] || 0);
  }, 0) || 0;

  return (
    <div className="space-y-3">
      {clientKeys?.map((key) => {
        const mapKey = `${key.server_id}:${key.outline_key_id}`;
        const keyUsage = usageMap[mapKey] || 0;
        const usagePercent = totalBytes > 0 ? (keyUsage / totalBytes) * 100 : 0;

        // Key is active if its usage increased in the last 35 seconds
        const isActiveNow = lastActiveKeys[mapKey] && (Date.now() - lastActiveKeys[mapKey] < 35000);

        return (
          <div key={key.id} className="glass-card p-4 flex flex-col gap-4">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              {/* Left Side: Server Info */}
              <div className="flex items-center gap-4 w-full md:w-64 shrink-0 min-w-0">
                <div className={`p-3 rounded-xl shrink-0 relative ${isActiveNow ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white/5 text-zinc-400'}`}>
                  <Server size={20} />
                  {isActiveNow && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white truncate flex items-center gap-2" title={key.servers?.name || "Unknown Server"}>
                    {key.servers?.name || "Unknown Server"}
                    {isActiveNow && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider animate-pulse flex items-center gap-0.5 shrink-0">
                        <Wifi size={8} /> Active
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-zinc-400 mt-0.5 flex items-center gap-1 truncate" title={key.outline_key_id}>
                    <Key size={14} className="shrink-0" />
                    <span className="truncate">{key.outline_key_id}</span>
                  </p>
                </div>
              </div>
              
              {/* Right Side: Usage & URL */}
              <div className="flex-1 w-full flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 min-w-0">
                {/* Usage Badge */}
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg shrink-0">
                  <Activity size={14} className="text-emerald-400" />
                  <span className="text-sm font-mono font-medium text-white">
                    {formatBytes(keyUsage)}
                  </span>
                </div>

                {/* Access URL */}
                <div className="flex-1 w-full min-w-0">
                  <p className="text-xs text-zinc-500 mb-1">Access URL</p>
                  <p className="text-sm font-mono text-zinc-300 truncate w-full bg-white/5 px-2 py-1.5 rounded-md" title={key.access_url}>
                    {key.access_url}
                  </p>
                </div>
                
                {/* Actions */}
                <div className="shrink-0 self-end sm:self-center mt-1 sm:mt-0">
                  <DeleteKeyButton keyId={key.id} clientId={clientId} />
                </div>
              </div>
            </div>

            {/* Usage Progress Bar */}
            {totalBytes > 0 && (
              <div className="w-full">
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                  <span>Usage share</span>
                  <span>{usagePercent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-purple-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {(!clientKeys || clientKeys.length === 0) && (
        <div className="text-center py-12 text-zinc-500">
          <Server size={32} className="mx-auto mb-3 opacity-50" />
          <p>No servers assigned yet. Assign a server to generate access keys.</p>
        </div>
      )}
    </div>
  );
}
