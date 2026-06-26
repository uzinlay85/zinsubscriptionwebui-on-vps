"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { updateClient } from "./actions";
import { Pencil, X, Loader2, Check } from "lucide-react";

export function EditClientForm({ client }: { client: { id: string; name: string; expiry_date?: string | null } }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format existing expiry_date to YYYY-MM-DD for the input
  const defaultDate = client.expiry_date ? new Date(client.expiry_date).toISOString().split('T')[0] : "";

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    formData.append("id", client.id);
    const result = await updateClient(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setIsOpen(false);
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 p-2 rounded-xl transition-colors"
        title="Edit Client"
      >
        <Pencil size={18} />
      </button>

      {isOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in">
          <div className="glass-card w-full max-w-md p-5 sm:p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold text-white mb-1">Edit Client</h2>
            <p className="text-sm text-zinc-500 mb-6">Update the client's display name or expiry.</p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}

            <form action={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Client Name
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={client.name}
                  required
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Expiry Date (Optional)</label>
                <input 
                  type="date" 
                  name="expiryDate" 
                  defaultValue={defaultDate}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]"
                />
                <p className="text-xs text-zinc-500 mt-1">If set, access will be revoked after this date.</p>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 rounded-xl font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
