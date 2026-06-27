"use client";

import { useState } from "react";
import { updateServer } from "./actions";
import { Pencil, X, Loader2 } from "lucide-react";

export function EditServerForm({ server }: { server: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    try {
      setLoading(true);
      setError(null);
      const result = await updateServer(formData);
      
      if (result?.error) {
        setError(result.error);
      } else {
        setIsOpen(false);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 p-2 rounded-xl transition-colors"
        title="Edit Server"
      >
        <Pencil size={18} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in">
          <div className="glass-card w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold text-white mb-6">Edit Server</h2>
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}

            <form action={handleSubmit} className="space-y-4">
              <input type="hidden" name="id" value={server.id} />
              <input type="hidden" name="type" value={server.type} />
              
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Server Name</label>
                <input 
                  type="text" 
                  name="name" 
                  defaultValue={server.name}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">API URL</label>
                <input 
                  type="url" 
                  name="apiUrl" 
                  defaultValue={server.api_url}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {server.type === "outline" && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Cert SHA-256</label>
                  <input 
                    type="text" 
                    name="certSha256" 
                    defaultValue={server.cert_sha256}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              )}

              {(server.type === "hysteria2" || server.type === "3x-ui") && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">
                        {server.type === "hysteria2" ? "Auth Username (optional)" : "Panel Username"}
                      </label>
                      <input 
                        type="text" 
                        name={server.type === "3x-ui" ? "username" : "authUsername"} 
                        defaultValue={server.type === "3x-ui" ? server.username : server.auth_username}
                        required={server.type === "3x-ui"}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">
                        {server.type === "hysteria2" ? "Auth Password" : "Panel Password"}
                      </label>
                      <input 
                        type="text" 
                        name={server.type === "3x-ui" ? "password" : "authPassword"} 
                        defaultValue={server.type === "3x-ui" ? server.password : server.auth_password}
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>
                  </div>
                  {server.type === "3x-ui" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Inbound ID</label>
                        <input 
                          type="number" 
                          name="inboundId" 
                          defaultValue={server.inbound_id}
                          required
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <label className="block text-sm font-medium text-zinc-400 mb-1">External Domain (Optional)</label>
                          <input 
                            type="text" 
                            name="externalDomain" 
                            defaultValue={server.external_domain || ""}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            placeholder="e.g. sgvless.truehand.top"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-400 mb-1">External Port (Optional)</label>
                          <input 
                            type="number" 
                            name="externalPort" 
                            defaultValue={server.external_port || ""}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            placeholder="e.g. 443"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsOpen(false)}
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
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
