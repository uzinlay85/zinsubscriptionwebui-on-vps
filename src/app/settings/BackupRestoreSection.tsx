"use client";

import { useState, useEffect, useRef } from "react";
import { HardDriveDownload, HardDriveUpload, Cloud, Loader2, Check, AlertCircle, RefreshCw, Trash2, DownloadCloud, UploadCloud } from "lucide-react";

interface RemoteFile {
  name: string;
  href: string;
  size: number;
  lastModified: string;
}

export function BackupRestoreSection() {
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUser, setWebdavUser] = useState("");
  const [webdavPass, setWebdavPass] = useState("");
  const [autoBackup, setAutoBackup] = useState(false);
  
  const [remoteFiles, setRemoteFiles] = useState<RemoteFile[]>([]);
  
  const [loadingType, setLoadingType] = useState<string | null>("fetch_settings");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings from database
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        const s = data.settings || {};
        
        if (s.webdav_url) setWebdavUrl(s.webdav_url);
        if (s.webdav_username) setWebdavUser(s.webdav_username);
        if (s.webdav_password) setWebdavPass(s.webdav_password);
        if (s.auto_backup_enabled === "true") setAutoBackup(true);
        
        // If we have URL and creds, fetch remote list
        if (s.webdav_url && s.webdav_username) {
          fetchRemoteFiles(s.webdav_url, s.webdav_username, s.webdav_password);
        }
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoadingType(null);
      }
    }
    loadSettings();
  }, []);

  async function fetchRemoteFiles(url = webdavUrl, username = webdavUser, password = webdavPass) {
    if (!url || !username || !password) return;
    setLoadingType("list");
    try {
      const res = await fetch("/api/backup/webdav/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, username, password })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRemoteFiles(data.files || []);
    } catch (err: any) {
      console.error("Failed to list remote files", err);
    } finally {
      setLoadingType(null);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setLoadingType("save_settings");
    setMessage(null);
    try {
      const settings = {
        webdav_url: webdavUrl,
        webdav_username: webdavUser,
        webdav_password: webdavPass,
        auto_backup_enabled: autoBackup ? "true" : "false"
      };

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings })
      });

      if (!res.ok) throw new Error(await res.text());
      
      setMessage({ type: "success", text: "Settings saved securely to Database." });
      fetchRemoteFiles();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoadingType(null);
    }
  }

  async function handleManualWebdavBackup() {
    if (!webdavUrl || !webdavUser || !webdavPass) {
      setMessage({ type: "error", text: "Please save your WebDAV settings first." });
      return;
    }

    setLoadingType("manual_backup");
    setMessage(null);
    try {
      // 1. Fetch the backup data first
      const exportRes = await fetch("/api/backup/export");
      if (!exportRes.ok) throw new Error("Failed to generate backup data");
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
      
      setMessage({ type: "success", text: "Backup uploaded to Cloud successfully." });
      fetchRemoteFiles(); // Refresh list
    } catch (err: any) {
      setMessage({ type: "error", text: `WebDAV Upload failed: ${err.message}` });
    } finally {
      setLoadingType(null);
    }
  }

  async function handleDeleteRemote(href: string) {
    if (!confirm("Are you sure you want to delete this backup from the cloud?")) return;
    setLoadingType(href);
    try {
      const res = await fetch("/api/backup/webdav/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webdavUrl, username: webdavUser, password: webdavPass, href })
      });
      if (!res.ok) throw new Error(await res.text());
      fetchRemoteFiles();
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    } finally {
      setLoadingType(null);
    }
  }

  async function handleRestoreRemote(href: string) {
    if (!confirm("Warning: Restoring will overwrite existing data. Proceed?")) return;
    setLoadingType("restore_" + href);
    setMessage(null);
    try {
      const res = await fetch("/api/backup/webdav/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webdavUrl, username: webdavUser, password: webdavPass, href })
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage({ type: "success", text: "Database restored successfully. Reloading..." });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setMessage({ type: "error", text: "Restore failed: " + err.message });
      setLoadingType(null);
    }
  }

  async function handleExport() {
    setLoadingType("export");
    setMessage(null);
    try {
      const res = await fetch("/api/backup/export");
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `outline_panel_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setMessage({ type: "error", text: `Export failed: ${err.message}` });
    } finally {
      setLoadingType(null);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("Warning: Restoring a local backup will OVERWRITE existing data. Proceed?")) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setLoadingType("import");
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/backup/import", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      setMessage({ type: "success", text: "Restored successfully. Reloading..." });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setMessage({ type: "error", text: `Import failed: ${err.message}` });
    } finally {
      setLoadingType(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  return (
    <div className="glass-card p-6 mt-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
          <Cloud size={24} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Backup & Restore</h2>
          <p className="text-sm text-zinc-400">Manage Local and Auto Cloud Backups</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl mb-6 flex items-start gap-3 border ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.type === 'success' ? <Check size={20} className="mt-0.5 shrink-0" /> : <AlertCircle size={20} className="mt-0.5 shrink-0" />}
          <p className="text-sm leading-relaxed">{message.text}</p>
        </div>
      )}

      {/* WebDAV Settings Section */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
        <h3 className="font-medium text-white mb-2 flex items-center gap-2">
          Cloud Backup Settings
        </h3>
        <p className="text-xs text-zinc-400 mb-5">
          Credentials are saved securely in your Database to allow Vercel Auto Backups to run in the background.
        </p>

        <form onSubmit={handleSaveSettings} className="space-y-4">
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

          <div className="flex items-center gap-3 pt-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={autoBackup}
                onChange={(e) => setAutoBackup(e.target.checked)}
              />
              <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
              <span className="ml-3 text-sm font-medium text-zinc-300">Enable Daily Auto Backup</span>
            </label>
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loadingType === "save_settings"}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl transition-colors font-medium text-sm disabled:opacity-50"
            >
              {loadingType === "save_settings" ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              Save Settings
            </button>
            <button
              type="button"
              onClick={handleManualWebdavBackup}
              disabled={loadingType === "manual_backup"}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl transition-colors font-medium text-sm disabled:opacity-50"
            >
              {loadingType === "manual_backup" ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
              Manual Backup Now
            </button>
          </div>
        </form>
      </div>

      {/* Remote Backups List */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-white flex items-center gap-2">
            Remote Backups
          </h3>
          <button 
            onClick={() => fetchRemoteFiles()}
            className="text-xs flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={loadingType === "list" ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="bg-black/30 rounded-xl border border-white/5 overflow-hidden">
          {remoteFiles.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No backups found in remote folder.
            </div>
          ) : (
            <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
              {remoteFiles.map((file, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Cloud size={18} className="text-zinc-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                      <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                        <span>{new Date(file.lastModified).toLocaleString()}</span>
                        <span>{formatBytes(file.size)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        const url = new URL(webdavUrl);
                        const downloadUrl = `${url.protocol}//${url.host}${file.href}`;
                        window.open(downloadUrl, "_blank");
                      }}
                      className="text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-2.5 py-1.5 rounded text-center min-w-[70px]"
                    >
                      Download
                    </button>
                    <button 
                      onClick={() => handleRestoreRemote(file.href)}
                      disabled={loadingType === "restore_" + file.href}
                      className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-2.5 py-1.5 rounded text-center min-w-[70px]"
                    >
                      {loadingType === "restore_" + file.href ? "Wait..." : "Restore"}
                    </button>
                    <button 
                      onClick={() => handleDeleteRemote(file.href)}
                      disabled={loadingType === file.href}
                      className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2.5 py-1.5 rounded text-center min-w-[70px]"
                    >
                      {loadingType === file.href ? "Wait..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Local Backup Section */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="font-medium text-white mb-4 flex items-center gap-2">
          Local Backup
        </h3>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleExport}
            disabled={loadingType === "export"}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl transition-colors font-medium text-sm disabled:opacity-50"
          >
            {loadingType === "export" ? <Loader2 size={18} className="animate-spin" /> : <HardDriveDownload size={18} />}
            Download .json
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
              disabled={loadingType === "import"}
              className="flex items-center gap-2 bg-white/5 text-zinc-300 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-xl transition-colors font-medium text-sm disabled:opacity-50"
            >
              {loadingType === "import" ? <Loader2 size={18} className="animate-spin" /> : <HardDriveUpload size={18} />}
              Restore .json
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
