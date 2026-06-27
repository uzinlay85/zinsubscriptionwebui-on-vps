"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search, Trash2, X, AlertTriangle, Loader2 } from "lucide-react";

export function ScanOrphanKeysButton({ serverId, serverName }: { serverId: string; serverName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orphans, setOrphans] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanned, setScanned] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setScanned(false);
    try {
      const res = await fetch(`/api/servers/${serverId}/orphans`);
      const data = await res.json();
      if (res.ok && data.success) {
        setOrphans(data.orphans || []);
        setScanned(true);
        setSelectedIds(new Set()); // Reset selections
      } else {
        setError(data.error || "Failed to scan for orphan keys.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = () => {
    if (selectedIds.size === orphans.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orphans.map(o => o.id)));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmDelete = confirm("Are you sure you want to delete the selected keys from the server?");
    if (!confirmDelete) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/orphans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orphanIds: Array.from(selectedIds) })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Remove deleted items from the list
        const deletedIds = data.results.filter((r: any) => r.success).map((r: any) => r.id);
        setOrphans(orphans.filter(o => !deletedIds.includes(o.id)));
        setSelectedIds(new Set());
        alert(`Successfully deleted ${deletedIds.length} keys.`);
      } else {
        setError(data.error || "Failed to delete some keys.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { setIsOpen(true); handleScan(); }}
        className="p-2 text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors"
        title="Scan Orphan Keys"
      >
        <Search size={18} />
      </button>

      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Search size={24} className="text-orange-400" />
                  Scan Orphan Keys
                </h2>
                <p className="text-sm text-zinc-400 mt-1">
                  Server: <span className="text-white font-mono">{serverName}</span>
                </p>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex gap-3 text-orange-200 text-sm">
                <AlertTriangle className="shrink-0 text-orange-400" size={20} />
                <p>
                  <strong>Warning:</strong> These keys exist on the server but are not in the Panel's database. 
                  This list may include keys that were <span className="font-bold underline">manually created</span> directly on the server. 
                  Only delete keys that you are sure belong to deleted clients.
                </p>
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="animate-spin text-orange-400 mb-4" size={32} />
                  <p className="text-zinc-400">Scanning server API...</p>
                </div>
              ) : scanned ? (
                orphans.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400 bg-white/5 rounded-xl border border-white/5">
                    No orphan keys found. The server is clean!
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-zinc-400">
                        Found <strong className="text-white">{orphans.length}</strong> unmanaged keys.
                      </p>
                      <button
                        onClick={toggleAll}
                        className="text-sm text-blue-400 hover:text-blue-300 px-3 py-1.5 bg-blue-500/10 rounded-lg transition-colors"
                      >
                        {selectedIds.size === orphans.length ? "Unselect All" : "Select All"}
                      </button>
                    </div>

                    <div className="bg-black/20 border border-white/5 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-zinc-400 text-xs uppercase tracking-wider">
                            <th className="p-3 w-10"></th>
                            <th className="p-3">Name / Email</th>
                            <th className="p-3 font-mono text-right">Key ID</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-white/5">
                          {orphans.map((orphan) => (
                            <tr 
                              key={orphan.id} 
                              className={`hover:bg-white/5 transition-colors cursor-pointer ${selectedIds.has(orphan.id) ? 'bg-orange-500/5' : ''}`}
                              onClick={() => toggleSelection(orphan.id)}
                            >
                              <td className="p-3">
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedIds.has(orphan.id) ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-600'}`}>
                                  {selectedIds.has(orphan.id) && <Search size={14} className="opacity-0" />} 
                                  {/* Dummy icon for spacing, or standard checkmark */}
                                  {selectedIds.has(orphan.id) && (
                                    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 stroke-white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-zinc-200">
                                {orphan.name}
                              </td>
                              <td className="p-3 text-zinc-500 font-mono text-xs text-right break-all">
                                {orphan.id.substring(0, 20)}{orphan.id.length > 20 ? '...' : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              ) : null}
            </div>

            <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-white/5">
              <button
                onClick={() => setIsOpen(false)}
                className="px-5 py-2.5 rounded-xl font-medium text-white hover:bg-white/10 transition-colors"
                disabled={deleting}
              >
                Close
              </button>
              {orphans.length > 0 && (
                <button
                  onClick={handleDelete}
                  disabled={selectedIds.size === 0 || deleting}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  {deleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                  Delete Selected ({selectedIds.size})
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
