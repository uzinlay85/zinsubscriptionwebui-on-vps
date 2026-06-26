"use client";

import { useState, useEffect } from "react";
import { Link2, Copy, Check } from "lucide-react";

export function CopyLinkButton({ token, name }: { token: string, name: string }) {
  const [copied, setCopied] = useState(false);
  const [fullUrl, setFullUrl] = useState("");

  useEffect(() => {
    // Generate the full subscription URL using the current domain
    setFullUrl(`${window.location.origin}/api/sub/${token}`);
  }, [token]);

  async function handleCopy() {
    if (!fullUrl) return;
    try {
      const textToCopy = `${name}: ${fullUrl}`;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  }

  return (
    <div className="w-full sm:w-auto bg-white/5 border border-white/5 rounded-xl px-4 py-2 flex items-center justify-between gap-3 relative group/link transition-colors hover:bg-white/10">
      <div className="flex items-center gap-3 overflow-hidden">
        <Link2 size={16} className="text-zinc-500 shrink-0" />
        <span className="text-sm font-mono text-zinc-300 truncate max-w-[120px] sm:max-w-[150px]">
          {token}
        </span>
      </div>
      <button 
        onClick={handleCopy}
        className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-all shrink-0"
        title="Copy Subscription URL"
      >
        {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
      </button>
    </div>
  );
}
