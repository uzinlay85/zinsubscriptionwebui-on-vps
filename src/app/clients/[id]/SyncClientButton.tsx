"use client";

import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { syncClientKeys } from "../actions";

export function SyncClientButton({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    const result = await syncClientKeys(clientId) as any;
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
      className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-4 py-2 rounded-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      title="Sync Keys (Generate missing keys for this client on all servers)"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
      Sync Missing Servers
    </button>
  );
}
