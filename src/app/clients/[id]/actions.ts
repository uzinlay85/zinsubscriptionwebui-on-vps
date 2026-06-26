"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { createOutlineKey, deleteOutlineKey } from "@/lib/outline";

export async function assignServerToClient(formData: FormData) {
  const clientId = formData.get("clientId") as string;
  const serverId = formData.get("serverId") as string;

  if (!clientId || !serverId) {
    return { error: "Client and Server are required" };
  }

  // Fetch server details
  const { data: server, error: serverError } = await supabase
    .from("servers").select("*").eq("id", serverId).single();
  if (serverError || !server) return { error: "Server not found" };

  // Fetch client details
  const { data: client, error: clientError } = await supabase
    .from("clients").select("*").eq("id", clientId).single();
  if (clientError || !client) return { error: "Client not found" };

  const serverData = server as any;
  const clientData = client as any;
  const keyName = `${serverData.name} - ${clientData.name}`;

  try {
    const outlineKey = await createOutlineKey(serverData.api_url, keyName);

    const { error: insertError } = await supabase.from("client_keys").insert({
      client_id: clientId,
      server_id: serverId,
      outline_key_id: outlineKey.id,
      access_url: outlineKey.accessUrl,
    });

    if (insertError) return { error: insertError.message };

    revalidatePath(`/clients/${clientId}`);
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Failed to connect to Outline server" };
  }
}

export async function removeClientKey(id: string, clientId: string) {
  // 1. Fetch key with server details before deleting
  const { data: keyData } = await supabase
    .from("client_keys")
    .select("*, servers(api_url)")
    .eq("id", id)
    .single();

  const key = keyData as any;

  // 2. Delete from Outline server first
  if (key?.servers?.api_url && key?.outline_key_id) {
    await deleteOutlineKey(key.servers.api_url, key.outline_key_id);
  }

  // 3. Delete from DB
  const { error } = await supabase.from("client_keys").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}
