"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function assignServerToClient(formData: FormData) {
  const clientId = formData.get("clientId") as string;
  const serverId = formData.get("serverId") as string;
  const outlineKeyId = formData.get("outlineKeyId") as string;
  const accessUrl = formData.get("accessUrl") as string;

  if (!clientId || !serverId || !outlineKeyId || !accessUrl) {
    return { error: "All fields are required" };
  }

  // @ts-expect-error - bypass strict type checking for insert payload
  const { error } = await supabase.from("client_keys").insert({
    client_id: clientId,
    server_id: serverId,
    outline_key_id: outlineKeyId,
    access_url: accessUrl,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}

export async function removeClientKey(id: string, clientId: string) {
  const { error } = await supabase.from("client_keys").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}
