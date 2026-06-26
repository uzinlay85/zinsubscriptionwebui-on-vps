"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncServerKeys } from "./actions";

export function SyncServerButton({ serverId }: { serverId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    const result = await syncServerKeys(serverId) as any;
    setLoading(false);
    
    if (result?.error) {
      alert("Error: " + result.error);
    } else if (result?.message) {
      alert(result.message + (result.warning ? "\nWarning: " + result.warning : ""));
    }
  }

  return (
    <button 
      onClick={handleSync}
      disabled={loading}
      className={`p-2 rounded-lg transition-colors ${loading ? "text-blue-400 bg-blue-400/10 cursor-not-allowed" : "text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10"}`}
      title="Sync Keys (Generate keys for missing clients)"
    >
      <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
    </button>
  );
}
