import { KeyRound, Shield, AlertTriangle } from "lucide-react";

export const revalidate = 0;

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <p className="text-zinc-400 mt-1">Manage admin panel settings and security.</p>
      </div>

      <div className="grid gap-6 mt-8">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
              <Shield size={24} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Admin Security</h2>
              <p className="text-sm text-zinc-400">Manage your login credentials.</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-medium text-white mb-1">Changing Credentials</h3>
                <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                  For security reasons, your admin username and password are not stored in the database. 
                  They are securely stored as environment variables on your server (Vercel).
                </p>
                <div className="bg-black/30 p-4 rounded-lg">
                  <p className="text-sm text-zinc-300 font-medium mb-2">To change your login details:</p>
                  <ol className="list-decimal list-inside text-sm text-zinc-400 space-y-2 ml-1">
                    <li>Go to your Vercel Project Dashboard</li>
                    <li>Navigate to <strong>Settings</strong> &gt; <strong>Environment Variables</strong></li>
                    <li>Update <code className="bg-white/10 px-1.5 py-0.5 rounded">ADMIN_USERNAME</code> and/or <code className="bg-white/10 px-1.5 py-0.5 rounded">ADMIN_PASSWORD</code></li>
                    <li>Click <strong>Save</strong> and Redeploy your project</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center gap-4 opacity-75">
              <div className="p-2 bg-white/10 rounded-lg">
                <KeyRound size={20} className="text-zinc-300" />
              </div>
              <div>
                <p className="text-xs text-zinc-500 font-medium mb-0.5">Current Username</p>
                <p className="text-sm text-white font-mono">
                  {process.env.ADMIN_USERNAME || "Not Set"}
                </p>
              </div>
            </div>
            
            <div className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center gap-4 opacity-75">
              <div className="p-2 bg-white/10 rounded-lg">
                <Shield size={20} className="text-zinc-300" />
              </div>
              <div>
                <p className="text-xs text-zinc-500 font-medium mb-0.5">Auth Secret Status</p>
                <p className="text-sm text-emerald-400 font-mono">
                  {process.env.AUTH_SECRET ? "Securely Configured" : "Missing"}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
