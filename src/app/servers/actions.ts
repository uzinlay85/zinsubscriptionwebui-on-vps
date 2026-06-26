"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { createOutlineKey } from "@/lib/outline";
import { loginHysteria, createHysteriaUser, buildHysteriaUri } from "@/lib/hysteria2";
import crypto from "crypto";

export async function addServer(formData: FormData) {
  const type = formData.get("type") as string || "outline";
  const name = formData.get("name") as string;
  const apiUrl = formData.get("apiUrl") as string;
  const certSha256 = formData.get("certSha256") as string;
  const authUsername = formData.get("authUsername") as string;
  const authPassword = formData.get("authPassword") as string;

  if (!name || !apiUrl) {
    return { error: "Name and API URL are required" };
  }
  if (type === "outline" && !certSha256) {
    return { error: "Cert SHA-256 is required for Outline" };
  }
  if (type === "hysteria2" && (!authUsername || !authPassword)) {
    return { error: "Admin Username and Password are required for Hysteria2" };
  }

  // 1. Authenticate with Hysteria2 FIRST to prevent dangling servers
  let hy2Token = "";
  if (type === "hysteria2") {
    try {
      hy2Token = await loginHysteria(apiUrl, authUsername, authPassword);
    } catch (err: any) {
      return { error: `Failed to authenticate with Hysteria2 Server. ${err.message}` };
    }
  }

  // 2. Create the server record
  const { data: newServer, error: serverError } = await supabase
    .from("servers")
    .insert({ 
      name, 
      api_url: apiUrl, 
      cert_sha256: certSha256 || "none",
      type,
      auth_username: authUsername || null,
      auth_password: authPassword || null
    })
    .select()
    .single();

  if (serverError || !newServer) {
    return { error: serverError?.message || "Failed to create server" };
  }

  const server = newServer as any;

  // 3. Fetch all existing active clients
  const { data: clientsData } = await supabase
    .from("clients")
    .select("*")
    .eq("status", "active");
  const clients = (clientsData as any[]) || [];

  // 4. Auto-generate a key on this new server for every existing client

  const results = await Promise.allSettled(
    clients.map(async (client) => {
      let keyId = "";
      let accessUrl = "";

      if (type === "outline") {
        const keyName = `${name} - ${client.name}`;
        const key = await createOutlineKey(apiUrl, keyName);
        keyId = key.id;
        accessUrl = key.accessUrl;
      } else if (type === "hysteria2") {
        // Generate a random password for the user (6 chars)
        const userPass = crypto.randomBytes(3).toString('hex');
        await createHysteriaUser(apiUrl, hy2Token, client.name, userPass);
        keyId = userPass; // Use password as key ID since it's unique
        accessUrl = buildHysteriaUri(apiUrl, userPass, `${name} - ${client.name}`);
      }

      await supabase.from("client_keys").insert({
        client_id: client.id,
        server_id: server.id,
        outline_key_id: keyId,
        access_url: accessUrl,
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
