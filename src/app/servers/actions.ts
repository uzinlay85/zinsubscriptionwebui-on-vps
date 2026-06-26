"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { createOutlineKey } from "@/lib/outline";

export async function addServer(formData: FormData) {
  const name = formData.get("name") as string;
  const apiUrl = formData.get("apiUrl") as string;
  const certSha256 = formData.get("certSha256") as string;

  if (!name || !apiUrl || !certSha256) {
    return { error: "All fields are required" };
  }

  // 1. Create the server record
  const { data: newServer, error: serverError } = await supabase
    .from("servers")
    .insert({ name, api_url: apiUrl, cert_sha256: certSha256 })
    .select()
    .single();

  if (serverError || !newServer) {
    return { error: serverError?.message || "Failed to create server" };
  }

  const server = newServer as any;

  // 2. Fetch all existing active clients
  const { data: clientsData } = await supabase
    .from("clients")
    .select("*")
    .eq("status", "active");
  const clients = (clientsData as any[]) || [];

  // 3. Auto-generate a key on this new server for every existing client
  const results = await Promise.allSettled(
    clients.map(async (client) => {
      const keyName = `${name} - ${client.name}`;
      const key = await createOutlineKey(apiUrl, keyName);
      await supabase.from("client_keys").insert({
        client_id: client.id,
        server_id: server.id,
        outline_key_id: key.id,
        access_url: key.accessUrl,
      });
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;

  revalidatePath("/servers");
  revalidatePath("/clients");
  if (failed > 0) {
    return { success: true, warning: `${failed} client(s) failed to get keys.` };
  }
  return { success: true };
}

export async function deleteServer(id: string) {
  const { error } = await supabase.from("servers").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/servers");
  return { success: true };
}
