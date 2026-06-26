"use client";

import { Trash2, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { removeClientKey } from "./actions";

export function DeleteKeyButton({ keyId, clientId }: { keyId: string; clientId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (confirm("Are you sure you want to delete this key? This action cannot be undone.")) {
      startTransition(async () => {
        const result = await removeClientKey(keyId, clientId);
        if (result?.error) {
          alert(`Failed to delete key: ${result.error}`);
        }
      });
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="text-zinc-500 hover:text-red-400 p-2 hover:bg-red-400/10 rounded-xl transition-colors mt-4 md:mt-0 disabled:opacity-50"
      title="Remove Access"
    >
      {isPending ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
    </button>
  );
}
