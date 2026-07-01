"use client";

import { useState } from "react";
import { RotateCcw, Loader2 } from "lucide-react";
import { resetClientUsage } from "../actions";

export function ResetUsageButton({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (
      !confirm(
        "Are you sure you want to reset this client's data usage to 0 B? This will also reactivate their keys on all servers."
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await resetClientUsage(clientId);
      if (res?.error) {
        alert("Error resetting usage: " + res.error);
      }
    } catch (err: any) {
      alert("Failed to reset usage: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleReset}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
      title="Reset accumulated data usage to 0"
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <RotateCcw size={16} />
      )}
      Reset Usage
    </button>
  );
}
