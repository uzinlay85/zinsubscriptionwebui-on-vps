"use client";

import { useState } from "react";
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { syncClientKeys } from "../actions";

export function SyncClientButton({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  function dismissToast() {
    setToast(null);
  }

  async function handleSync() {
    setLoading(true);
    setToast(null);
    const result = await syncClientKeys(clientId) as any;
    setLoading(false);

    if (result?.error) {
      setToast({ type: "error", msg: result.error });
    } else if (result?.message) {
      const msg = result.message + (result.warning ? " ⚠️ " + result.warning : "");
      setToast({ type: "success", msg });
    } else {
      setToast({ type: "success", msg: "Keys synced successfully." });
    }

    // Auto-dismiss after 6s
    setTimeout(() => setToast(null), 6000);
  }

  return (
    <>
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-4 py-2 rounded-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        title="Sync Keys (Generate missing keys for this client on all servers)"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        {loading ? "Syncing..." : "Sync Missing Servers"}
      </button>

      {/* Inline Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 backdrop-blur text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in max-w-sm ${
            toast.type === "error"
              ? "bg-red-500/90"
              : "bg-emerald-600/90"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle size={16} className="shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="shrink-0" />
          )}
          <span className="flex-1">{toast.msg}</span>
          <button onClick={dismissToast} className="ml-1 hover:opacity-70 shrink-0">
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
