"use client";

import { useState, useEffect, useRef } from "react";
import { HardDriveDownload, HardDriveUpload, Cloud, Loader2, Check, AlertCircle } from "lucide-react";

export function BackupRestoreSection() {
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUser, setWebdavUser] = useState("");
  const [webdavPass, setWebdavPass] = useState("");
  
  const [loadingType, setLoadingType] = useState<"export" | "import" | "webdav" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved WebDAV credentials from localStorage on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem("outline_webdav_url");
    const savedUser = localStorage.getItem("outline_webdav_user");
    const savedPass = localStorage.getItem("outline_webdav_pass");
    if (savedUrl) setWebdavUrl(savedUrl);
    if (savedUser) setWebdavUser(savedUser);
    if (savedPass) setWebdavPass(savedPass);
  }, []);

  // Save to localStorage when changed
  useEffect(() => {
    localStorage.setItem("outline_webdav_url", webdavUrl);
    localStorage.setItem("outline_webdav_user", webdavUser);
    localStorage.setItem("outline_webdav_pass", webdavPass);
  }, [webdavUrl, webdavUser, webdavPass]);

  async function handleExport() {
    setLoadingType("export");
    setMessage(null);
    try {
      const res = await fetch("/api/backup/export");
      if (!res.ok) throw new Error(await res.text());
      
      // Trigger download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `outline_panel_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setMessage({ type: "success", text: "Backup downloaded successfully." });
    } catch (err: any) {
      setMessage({ type: "error", text: `Export failed: ${err.message}` });
    } finally {
      setLoadingType(null);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("Warning: Restoring a backup will OVERWRITE existing data with the same IDs. Proceed?")) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setLoadingType("import");
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/backup/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      
      setMessage({ type: "success", text: result.message });
      // Reload page to reflect new data
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setMessage({ type: "error", text: `Import failed: ${err.message}` });
    } finally {
      setLoadingType(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleWebdavBackup(e: React.FormEvent) {
    e.preventDefault();
    if (!webdavUrl || !webdavUser || !webdavPass) {
      setMessage({ type: "error", text: "Please fill in all WebDAV fields." });
      return;
    }

    setLoadingType("webdav");
    setMessage(null);
    try {
      // 1. Fetch the backup data first
      const exportRes = await fetch("/api/backup/export");
      if (!exportRes.ok) throw new Error("Failed to generate backup data: " + await exportRes.text());
      const backupData = await exportRes.json();

      // 2. Upload to WebDAV
      const webdavRes = await fetch("/api/backup/webdav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webdavUrl,
          username: webdavUser,
          password: webdavPass,
          backupData
        })
      });

      if (!webdavRes.ok) throw new Error(await webdavRes.text());
      const result = await webdavRes.json();
      
      setMessage({ type: "success", text: result.message });
    } catch (err: any) {
      setMessage({ type: "error", text: `WebDAV Upload failed: ${err.message}` });
    } finally {
      setLoadingType(null);
    }
  }

  return (
    <div className="glass-card p-6 mt-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
          <Cloud size={24} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Backup & Restore</h2>
          <p className="text-sm text-zinc-400">Manage local JSON backups and WebDAV cloud syncing.</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl mb-6 flex items-start gap-3 border ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.type === 'success' ? <Check size={20} className="mt-0.5 shrink-0" /> : <AlertCircle size={20} className="mt-0.5 shrink-0" />}
          <p className="text-sm leading-relaxed">{message.text}</p>
        </div>
      )}

      {/* Local Backup Section */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
        <h3 className="font-medium text-white mb-4 flex items-center gap-2">
          Local Backup
        </h3>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleExport}
            disabled={loadingType !== null}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl transition-colors font-medium text-sm disabled:opacity-50"
          >
            {loadingType === "export" ? <Loader2 size={18} className="animate-spin" /> : <HardDriveDownload size={18} />}
            Download Backup (.json)
          </button>
          
          <div>
            <input
              type="file"
              accept=".json"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImport}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loadingType !== null}
              className="flex items-center gap-2 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-500/20 px-5 py-2.5 rounded-xl transition-colors font-medium text-sm disabled:opacity-50"
            >
              {loadingType === "import" ? <Loader2 size={18} className="animate-spin" /> : <HardDriveUpload size={18} />}
              Restore from Backup
            </button>
          </div>
        </div>
      </div>

      {/* WebDAV Section */}
      <form onSubmit={handleWebdavBackup} className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="font-medium text-white mb-2 flex items-center gap-2">
          Cloud Backup (WebDAV)
        </h3>
        <p className="text-xs text-zinc-400 mb-5">
          Credentials are saved in your local browser storage, not the database. Compatible with Koofr, Nextcloud, etc.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">WebDAV Folder URL</label>
            <input
              type="url"
              value={webdavUrl}
              onChange={(e) => setWebdavUrl(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm"
              placeholder="e.g. https://app.koofr.net/dav/Koofr/Backups/"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
              <input
                type="text"
                value={webdavUser}
                onChange={(e) => setWebdavUser(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Password / App Password</label>
              <input
                type="password"
                value={webdavPass}
                onChange={(e) => setWebdavPass(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm"
                required
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loadingType !== null}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl transition-colors font-medium text-sm disabled:opacity-50"
            >
              {loadingType === "webdav" ? <Loader2 size={18} className="animate-spin" /> : <Cloud size={18} />}
              Backup to WebDAV
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
