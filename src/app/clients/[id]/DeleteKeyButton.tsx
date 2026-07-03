"use client";

import { useState } from "react";
import { Trash2, Loader2, AlertTriangle, Check, X, AlertCircle } from "lucide-react";
import { removeClientKey } from "./actions";

export function DeleteKeyButton({ keyId, clientId }: { keyId: string; clientId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsPending(true);
    setError(null);
    const result = await removeClientKey(keyId, clientId);
    if (result?.error) {
      setError(result.error);
      setConfirming(false);
      setIsPending(false);
      // Auto-clear error after 5s
      setTimeout(() => setError(null), 5000);
    }
    // On success page revalidates automatically — no need to reset state
  }

  if (error) {
    return (
      <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-xl px-2 py-1.5 text-xs text-red-400">
        <AlertCircle size={13} className="shrink-0" />
        <span className="truncate max-w-[120px]" title={error}>Failed</span>
        <button onClick={() => setError(null)} className="ml-1 hover:opacity-70">
          <X size={12} />
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 rounded-xl px-2 py-1">
        <AlertTriangle size={13} className="text-red-400 shrink-0" />
        <span className="text-xs text-red-300 font-medium whitespace-nowrap">Remove?</span>
        <button
          disabled={isPending}
          onClick={handleConfirm}
          className="p-1 text-red-400 hover:text-white hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
          title="Confirm remove"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        </button>
        <button
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="p-1 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          title="Cancel"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-zinc-500 hover:text-red-400 p-2 hover:bg-red-400/10 rounded-xl transition-colors"
      title="Remove Access"
    >
      <Trash2 size={18} />
    </button>
  );
}
