"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { createOutlineKey, deleteOutlineKey } from "@/lib/outline";

export async function addClient(formData: FormData) {
  const name = formData.get("name") as string;

  if (!name) {
    return { error: "Name is required" };
  }

  // 1. Create the client record
  const { data: newClient, error: clientError } = await supabase
    .from("clients")
    .insert({ name })
    .select()
    .single();

  if (clientError || !newClient) {
    return { error: clientError?.message || "Failed to create client" };
  }

  const client = newClient as any;

  // 2. Fetch all existing servers
  const { data: serversData } = await supabase.from("servers").select("*");
  const servers = (serversData as any[]) || [];

  // 3. Auto-generate a key on every server for this new client
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const keyName = `${server.name} - ${name}`;
      const key = await createOutlineKey(server.api_url, keyName);
      await supabase.from("client_keys").insert({
        client_id: client.id,
        server_id: server.id,
        outline_key_id: key.id,
        access_url: key.accessUrl,
      });
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;

  revalidatePath("/clients");
  if (failed > 0) {
    return { success: true, warning: `${failed} server(s) failed to generate keys.` };
  }
  return { success: true };
}


export async function updateClient(formData: FormData) {
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;

  if (!id || !name) {
    return { error: "ID and Name are required" };
  }

  const { error } = await supabase.from("clients").update({ name }).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/clients");
  return { success: true };
}

export async function deleteClient(id: string) {
  // 1. Fetch all keys for this client with server details
  const { data: keysData } = await supabase
    .from("client_keys")
    .select("*, servers(api_url)")
    .eq("client_id", id);

  const keys = (keysData as any[]) || [];

  // 2. Delete each key from the Outline server in parallel
  await Promise.allSettled(
    keys.map(async (key) => {
      const apiUrl = key.servers?.api_url;
      if (apiUrl && key.outline_key_id) {
        await deleteOutlineKey(apiUrl, key.outline_key_id);
      }
    })
  );

  // 3. Delete the client from DB (client_keys will cascade or be deleted too)
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/clients");
  return { success: true };
}

export async function toggleClientStatus(id: string, currentStatus: string) {
  const newStatus = currentStatus === "active" ? "inactive" : "active";
  const { error } = await supabase.from("clients").update({ status: newStatus }).eq("id", id);
  
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/clients");
  return { success: true };
}
