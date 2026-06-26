"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function addServer(formData: FormData) {
  const name = formData.get("name") as string;
  const apiUrl = formData.get("apiUrl") as string;
  const certSha256 = formData.get("certSha256") as string;

  if (!name || !apiUrl || !certSha256) {
    return { error: "All fields are required" };
  }

  const { error } = await supabase.from("servers").insert({
    name,
    api_url: apiUrl,
    cert_sha256: certSha256,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/servers");
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
