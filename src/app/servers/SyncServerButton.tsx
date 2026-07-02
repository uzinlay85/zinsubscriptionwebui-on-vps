"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X, Users, Loader2 } from "lucide-react";
import { syncServerKeys } from "./actions";

type Client = { id: string; name: string; status: string };

export function SyncServerButton({
  serverId,
  clients = [],
}: {
  serverId: string;
  clients?: Client[];
}) {
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [result, setResult] = useState<{ message?: string; warning?: string; error?: string } | null>(null);

  const activeClients = clients.filter((c) => c.status === "active");

  useEffect(() => {
    setMounted(true);
  }, []);

  function openModal() {
    setSelectedClientIds(activeClients.map((c) => c.id));
    setResult(null);
    setIsOpen(true);
  }

  function toggleClient(id: string) {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (selectedClientIds.length === activeClients.length) {
      setSelectedClientIds([]);
    } else {
      setSelectedClientIds(activeClients.map((c) => c.id));
    }
  }

  async function handleSync() {
    if (selectedClientIds.length === 0) {
      setResult({ error: "Please select at least one client." });
      return;
    }
    setLoading(true);
    setResult(null);
    const res = await syncServerKeys(serverId, selectedClientIds) as any;
    setLoading(false);
    setResult(res);
  }

  const allChecked = selectedClientIds.length === activeClients.length;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={openModal}
        className="p-2 rounded-lg transition-colors text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10"
        title="Sync Keys to Selected Clients"
      >
        <RefreshCw size={16} />
      </button>

      {/* Modal Rendered in Portal */}
      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in">
          <div className="glass-card w-full max-w-sm p-5 relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-blue-400" />
              <h3 className="text-base font-bold text-white">Sync Keys to Clients</h3>
            </div>

            <p className="text-xs text-zinc-500 mb-4">
              Select which clients should receive a key on this server. Already-assigned clients are skipped automatically.
            </p>

            {/* Result feedback */}
            {result && (
              <div className={`p-3 rounded-lg text-sm mb-4 ${
                result.error
                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                  : result.warning
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                  : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              }`}>
                {result.error || result.warning || result.message}
              </div>
            )}

            {activeClients.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">No active clients found.</p>
            ) : (
              <>
                {/* Select all toggle */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500">
                    {selectedClientIds.length}/{activeClients.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {allChecked ? "Deselect All" : "Select All"}
                  </button>
                </div>

                {/* Client list */}
                <div className="bg-black/30 border border-white/8 rounded-xl max-h-48 overflow-y-auto space-y-1 p-2 mb-4">
                  {activeClients.map((client) => {
                    const checked = selectedClientIds.includes(client.id);
                    return (
                      <label
                        key={client.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          checked
                            ? "bg-blue-500/10 border border-blue-500/20"
                            : "hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClient(client.id)}
                          className="accent-blue-500 w-4 h-4 shrink-0"
                        />
                        <span className="text-sm text-white truncate">{client.name}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleSync}
                disabled={loading || selectedClientIds.length === 0}
                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Sync ({selectedClientIds.length})
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
