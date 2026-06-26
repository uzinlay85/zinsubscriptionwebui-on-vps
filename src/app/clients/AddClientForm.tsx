"use client";

import { useState } from "react";
import { addClient, addBulkClients } from "./actions";
import { Plus, X, Loader2, Copy, Check, Users } from "lucide-react";
import { useRouter } from "next/navigation";

export function AddClientForm() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  
  // Success state for Bulk
  const [createdClients, setCreatedClients] = useState<Array<{name: string, sub_token: string}> | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  function resetForm() {
    setIsOpen(false);
    setError(null);
    setCreatedClients(null);
    setCopiedAll(false);
    // Refresh the page data so the new clients show up in the background list
    router.refresh();
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    
    if (mode === "single") {
      const result = await addClient(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      } else {
        resetForm();
        setLoading(false);
      }
    } else {
      const result = await addBulkClients(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      } else if (result?.clients) {
        setCreatedClients(result.clients);
        setLoading(false);
      }
    }
  }

  async function handleCopyAll() {
    if (!createdClients) return;
    const textToCopy = createdClients.map(c => `${c.name}: ${window.location.origin}/api/sub/${c.sub_token}`).join('\n');
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl transition-colors font-medium shadow-lg shadow-purple-500/20"
      >
        <Plus size={20} />
        Add Client
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in">
          <div className="glass-card w-full max-w-md p-6 relative">
            <button 
              onClick={resetForm}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold text-white mb-6">
              {createdClients ? "Clients Created Successfully" : "Add New Client"}
            </h2>

            {createdClients ? (
              <div className="space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-lg text-sm flex items-start gap-2">
                  <Check size={18} className="shrink-0 mt-0.5" />
                  Successfully created {createdClients.length} clients.
                </div>
                
                <div className="bg-black/30 border border-white/5 rounded-xl p-3 max-h-[200px] overflow-y-auto space-y-2">
                  {createdClients.map(c => (
                    <div key={c.sub_token} className="text-xs font-mono text-zinc-300 flex items-center gap-2">
                      <span className="text-purple-400">{c.name}:</span>
                      <span className="truncate">.../api/sub/{c.sub_token.substring(0, 8)}...</span>
                    </div>
                  ))}
                </div>

                <div className="pt-4 flex flex-col sm:flex-row justify-end gap-3">
                  <button 
                    onClick={resetForm}
                    className="px-4 py-2 rounded-xl font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors w-full sm:w-auto"
                  >
                    Close
                  </button>
                  <button 
                    onClick={handleCopyAll}
                    className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl transition-colors font-medium w-full sm:w-auto"
                  >
                    {copiedAll ? <Check size={18} /> : <Copy size={18} />}
                    {copiedAll ? "Copied!" : "Copy All Links"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Mode Toggle */}
                <div className="flex bg-black/40 p-1 rounded-xl mb-6">
                  <button
                    type="button"
                    onClick={() => { setMode("single"); setError(null); }}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${mode === "single" ? "bg-white/10 text-white shadow" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Single Client
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode("bulk"); setError(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${mode === "bulk" ? "bg-white/10 text-white shadow" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    <Users size={14} /> Bulk (Series)
                  </button>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm">
                    {error}
                  </div>
                )}

                <form action={handleSubmit} className="space-y-4">
                  {mode === "single" ? (
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">Client Name</label>
                      <input 
                        type="text" 
                        name="name" 
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        placeholder="e.g. John Doe - iPhone"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-1">
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Base Name</label>
                        <input 
                          type="text" 
                          name="baseName" 
                          required
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                          placeholder="e.g. vip"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Start No.</label>
                        <input 
                          type="number" 
                          name="startNumber" 
                          min="1"
                          required
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">End No.</label>
                        <input 
                          type="number" 
                          name="endNumber" 
                          min="1"
                          required
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                          placeholder="10"
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-3">
                        <p className="text-xs text-zinc-500">
                          (Max 50 at once). Example: Start 11, End 20 generates <code className="text-purple-400">vip-11</code> to <code className="text-purple-400">vip-20</code>.
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Expiry Date (Optional)</label>
                    <input 
                      type="date" 
                      name="expiryDate" 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors [color-scheme:dark]"
                    />
                    <p className="text-xs text-zinc-500 mt-1">If set, access will be revoked after this date.</p>
                  </div>

                  <div className="pt-4 flex justify-end gap-3">
                    <button 
                      type="button" 
                      onClick={resetForm}
                      className="px-4 py-2 rounded-xl font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading && <Loader2 size={16} className="animate-spin" />}
                      {mode === "single" ? "Create Client" : "Create Bulk Clients"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
