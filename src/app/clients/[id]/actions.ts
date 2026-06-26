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
    .select("*, servers(api_url, type, auth_username, auth_password)")
    .eq("id", id)
    .single();

  const key = keyData as any;
  const server = key?.servers;

  // 2. Delete from server first
  if (server?.api_url && key?.outline_key_id) {
    if (server.type === "outline" || !server.type) {
      await deleteOutlineKey(server.api_url, key.outline_key_id);
    } else if (server.type === "hysteria2") {
      try {
        const { loginHysteria, deleteHysteriaUser } = await import("@/lib/hysteria2");
        const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
        await deleteHysteriaUser(server.api_url, token, key.outline_key_id);
      } catch (err) {
        console.error("Failed to delete Hysteria user", err);
      }
    } else if (server.type === "3x-ui") {
      try {
        const { login3xui, deleteClient3xui } = await import("@/lib/3x-ui");
        const cookie = await login3xui(server.api_url, server.auth_username, server.auth_password);
        const serverDetails = await supabase.from("servers").select("inbound_id").eq("id", key.server_id).single();
        const inboundId = serverDetails.data?.inbound_id;
        if (inboundId) {
          await deleteClient3xui(server.api_url, cookie, inboundId, key.outline_key_id);
        }
      } catch (err) {
        console.error("Failed to delete 3x-ui user", err);
      }
    }
  }

  // 3. Delete from DB
  const { error } = await supabase.from("client_keys").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  return { success: true };
}
