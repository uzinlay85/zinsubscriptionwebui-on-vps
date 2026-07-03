"use client";

import { useState } from "react";
import { RotateCcw, Loader2, AlertTriangle, Check, X, CheckCircle2, AlertCircle } from "lucide-react";
import { resetClientUsage } from "../actions";

export function ResetUsageButton({ clientId }: { clientId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  function dismissToast() {
    setToast(null);
  }

  async function handleConfirm() {
    setLoading(true);
    setToast(null);
    try {
      const res = await resetClientUsage(clientId);
      if (res?.error) {
        setToast({ type: "error", msg: res.error });
      } else {
        setToast({ type: "success", msg: "Usage reset to 0 B. Keys reactivated." });
      }
    } catch (err: any) {
      setToast({ type: "error", msg: err.message || "Failed to reset usage." });
    } finally {
      setLoading(false);
      setConfirming(false);
    }
    setTimeout(() => setToast(null), 5000);
  }

  return (
    <>
      {confirming ? (
        <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5">
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <span className="text-xs text-amber-300 font-medium whitespace-nowrap">Reset usage?</span>
          <button
            disabled={loading}
            onClick={handleConfirm}
            className="p-1 text-amber-400 hover:text-white hover:bg-amber-500 rounded-lg transition-colors disabled:opacity-50"
            title="Confirm reset"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button
            disabled={loading}
            onClick={() => setConfirming(false)}
            className="p-1 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            title="Cancel"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm font-medium rounded-xl transition-colors"
          title="Reset accumulated data usage to 0"
        >
          <RotateCcw size={16} />
          Reset Usage
        </button>
      )}

      {/* Inline Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 backdrop-blur text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in max-w-sm ${
            toast.type === "error" ? "bg-red-500/90" : "bg-emerald-600/90"
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
