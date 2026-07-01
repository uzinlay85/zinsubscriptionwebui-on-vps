"use client";

import { useState, useEffect } from "react";
import { Globe, Loader2, Check } from "lucide-react";

export function GeneralSettingsSection() {
  const [appName, setAppName] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load settings from database
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        const s = data.settings || {};
        
        if (s.app_name) {
          setAppName(s.app_name);
        } else if (s.panel_name) {
          setAppName(s.panel_name);
        }
      } catch (err: any) {
        console.error(err);
      } finally {
        setFetching(false);
      }
    }
    loadSettings();
  }, []);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const settings = {
        app_name: appName.trim()
      };

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings })
      });

      if (!res.ok) throw new Error(await res.text());
      
      setMessage({ type: "success", text: "Brand settings saved successfully." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save settings." });
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div className="glass-card p-6 flex justify-center items-center h-48">
        <Loader2 className="animate-spin text-zinc-500" size={24} />
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
          <Globe size={24} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Brand Settings</h2>
          <p className="text-sm text-zinc-400">Configure your brand name to customize subscription profile titles.</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl mb-6 text-sm border ${
          message.type === "success" 
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
            : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">
            Brand Name (App Name)
          </label>
          <input
            type="text"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="e.g., free-testkey (Fallback: Panel Domain)"
          />
          <p className="text-xs text-zinc-500 mt-2">
            This name will be displayed in the subscription client group name: 
            <span className="font-mono text-zinc-400 ml-1">ClientName - BrandName [Date]</span>
          </p>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl transition-all font-medium disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check size={16} />
                Save Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
