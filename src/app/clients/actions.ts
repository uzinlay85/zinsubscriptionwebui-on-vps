"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function addClient(formData: FormData) {
  const name = formData.get("name") as string;

  if (!name) {
    return { error: "Name is required" };
  }

  const { error } = await supabase.from("clients").insert({
    name,
  } as any);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/clients");
  return { success: true };
}

export async function deleteClient(id: string) {
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
