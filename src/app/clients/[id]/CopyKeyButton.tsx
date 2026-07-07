"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyKeyButton({ accessUrl }: { accessUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!accessUrl) return;
    try {
      await navigator.clipboard.writeText(accessUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement("textarea");
      el.value = accessUrl;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy Access URL"}
      className={`p-2 rounded-xl transition-all duration-200 ${
        copied
          ? "text-emerald-400 bg-emerald-400/10"
          : "text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10"
      }`}
    >
      {copied ? (
        <Check size={18} />
      ) : (
        <Copy size={18} />
      )}
    </button>
  );
}