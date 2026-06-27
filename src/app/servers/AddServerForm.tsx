"use client";

import { useState } from "react";
import { addServer } from "./actions";
import { Plus, X, Loader2 } from "lucide-react";

export function AddServerForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverType, setServerType] = useState<"outline" | "hysteria2" | "3x-ui">("outline");

  async function handleSubmit(formData: FormData) {
    try {
      setLoading(true);
      setError(null);
      formData.append("type", serverType);
      const result = await addServer(formData);
      
      if (result?.error) {
        setError(result.error);
        window.alert("Error adding server: " + result.error);
      } else {
        window.alert("Server added successfully!");
        setIsOpen(false);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      window.alert("Exception: " + (err.message || "An unexpected error occurred."));
    } finally {
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
          <div className="glass-card w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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
                <div className="flex flex-col sm:flex-row bg-zinc-900/50 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setServerType("outline")}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${serverType === "outline" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-sm" : "text-zinc-400 border border-transparent hover:bg-white/5"}`}
                >
                  Outline
                </button>
                <button
                  type="button"
                  onClick={() => setServerType("hysteria2")}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${serverType === "hysteria2" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-sm" : "text-zinc-400 border border-transparent hover:bg-white/5"}`}
                >
                  Hysteria2
                </button>
                <button
                  type="button"
                  onClick={() => setServerType("3x-ui")}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${serverType === "3x-ui" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm" : "text-zinc-400 border border-transparent hover:bg-white/5"}`}
                >
                  3x-ui
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
                  {serverType === "outline" ? "Outline API URL" : serverType === "hysteria2" ? "Server Node Address (IP:Port)" : "3x-ui Panel URL (with port)"}
                </label>
                <input 
                  type="text" 
                  name="apiUrl" 
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder={serverType === "outline" ? "https://123.45.67.89:12345/xxxx" : serverType === "hysteria2" ? "123.45.67.89:443" : "http://123.45.67.89:2053"}
                />
              </div>

              {serverType === "outline" && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Certificate SHA-256</label>
                  <input 
                    type="text" 
                    name="certSha256" 
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="e.g. 4A:2B:..."
                  />
                </div>
              )}

              {(serverType === "hysteria2" || serverType === "3x-ui") && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">
                        {serverType === "hysteria2" ? "Auth Username (optional)" : "Panel Username"}
                      </label>
                      <input 
                        type="text" 
                        name={serverType === "3x-ui" ? "username" : "authUsername"} 
                        required={serverType === "3x-ui"}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        placeholder={serverType === "hysteria2" ? "e.g. admin" : "admin"}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">
                        {serverType === "hysteria2" ? "Auth Password" : "Panel Password"}
                      </label>
                      <input 
                        type="password" 
                        name={serverType === "3x-ui" ? "password" : "authPassword"} 
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        placeholder="e.g. strongpassword123"
                      />
                    </div>
                  </div>
                  {serverType === "3x-ui" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Inbound ID</label>
                        <input 
                          type="number" 
                          name="inboundId" 
                          required
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                          placeholder="e.g. 1"
                        />
                        <p className="text-xs text-zinc-500 mt-1">The ID of the inbound where clients will be added.</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-zinc-400 mb-1">External Domain (Optional)</label>
                          <input 
                            type="text" 
                            name="externalDomain" 
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            placeholder="e.g. sgvless.truehand.top"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-400 mb-1">External Port (Optional)</label>
                          <input 
                            type="number" 
                            name="externalPort" 
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
