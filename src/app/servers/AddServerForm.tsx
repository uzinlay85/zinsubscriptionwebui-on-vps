"use client";

import { useState } from "react";
import { addServer } from "./actions";
import { Plus, X, Loader2 } from "lucide-react";

export function AddServerForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverType, setServerType] = useState<"outline" | "hysteria2">("outline");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    formData.append("type", serverType);
    const result = await addServer(formData);
    
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setIsOpen(false);
      setLoading(false);
    }
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-xl transition-colors font-medium shadow-lg shadow-blue-500/20"
      >
        <Plus size={20} />
        Add Server
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in">
          <div className="glass-card w-full max-w-md p-6 relative">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold text-white mb-6">Add New Server</h2>
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}

            <form action={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Server Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setServerType("outline")}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${serverType === "outline" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-white/5 text-zinc-400 border border-transparent hover:bg-white/10"}`}
                  >
                    Outline
                  </button>
                  <button
                    type="button"
                    onClick={() => setServerType("hysteria2")}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${serverType === "hysteria2" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-white/5 text-zinc-400 border border-transparent hover:bg-white/10"}`}
                  >
                    Hysteria2
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Server Name</label>
                <input 
                  type="text" 
                  name="name" 
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder={serverType === "outline" ? "e.g. Singapore Outline" : "e.g. Singapore Hysteria"}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  {serverType === "outline" ? "Management API URL" : "Web UI Base URL"}
                </label>
                <input 
                  type="url" 
                  name="apiUrl" 
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder={serverType === "outline" ? "https://ip:port/secret" : "https://vpn.yourdomain.com/admin_123"}
                />
              </div>

              {serverType === "outline" ? (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">certSha256</label>
                  <input 
                    type="text" 
                    name="certSha256" 
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                    placeholder="API Cert SHA-256 Hash"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Admin User</label>
                    <input 
                      type="text" 
                      name="authUsername" 
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary transition-colors text-sm"
                      placeholder="e.g. admin"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Admin Pass</label>
                    <input 
                      type="password" 
                      name="authPassword" 
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary transition-colors text-sm"
                      placeholder="••••••"
                    />
                  </div>
                </div>
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
                  className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Save Server
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
