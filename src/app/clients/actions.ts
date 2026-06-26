"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { createOutlineKey, deleteOutlineKey } from "@/lib/outline";
import { loginHysteria, createHysteriaUser, buildHysteriaUri, deleteHysteriaUser } from "@/lib/hysteria2";
import crypto from "crypto";

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
      let keyId = "";
      let accessUrl = "";

      if (server.type === "outline" || !server.type) {
        const keyName = `${server.name} - ${name}`;
        const key = await createOutlineKey(server.api_url, keyName);
        keyId = key.id;
        accessUrl = key.accessUrl;
      } else if (server.type === "hysteria2") {
        // Authenticate with Hysteria2 Express backend
        const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
        // Generate random password for Hysteria2 user
        const userPass = crypto.randomBytes(3).toString('hex');
        await createHysteriaUser(server.api_url, token, name, userPass);
        
        keyId = userPass;
        accessUrl = buildHysteriaUri(server.api_url, name, userPass, `${server.name} - ${name}`);
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
    .select("*, servers(api_url, type, auth_username, auth_password)")
    .eq("client_id", id);

  const keys = (keysData as any[]) || [];

  // 2. Delete each key from the respective server in parallel
  await Promise.allSettled(
    keys.map(async (key) => {
      const server = key.servers;
      if (server?.api_url && key.outline_key_id) {
        if (server.type === "outline" || !server.type) {
          await deleteOutlineKey(server.api_url, key.outline_key_id);
        } else if (server.type === "hysteria2") {
          try {
            const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
            await deleteHysteriaUser(server.api_url, token, key.outline_key_id); // we used password as outline_key_id
          } catch (err) {
            console.error("Failed to delete Hysteria user", err);
          }
        }
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

export async function syncClientKeys(clientId: string) {
  // 1. Fetch client details
  const { data: clientData, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientError || !clientData) {
    return { error: "Client not found" };
  }
  const client = clientData as any;

  if (client.status !== "active") {
    return { error: "Cannot sync keys for an inactive client." };
  }

  // 2. Fetch all servers
  const { data: serversData } = await supabase.from("servers").select("*");
  const servers = (serversData as any[]) || [];

  // 3. Fetch existing keys for this client
  const { data: existingKeysData } = await supabase
    .from("client_keys")
    .select("server_id")
    .eq("client_id", clientId);
  const existingKeys = (existingKeysData as any[]) || [];
  const existingServerIds = new Set(existingKeys.map(k => k.server_id));

  // 4. Find servers that don't have a key for this client
  const missingServers = servers.filter(s => !existingServerIds.has(s.id));

  if (missingServers.length === 0) {
    return { success: true, message: "Client already has keys on all servers." };
  }

  // 5. Generate keys on missing servers
  const results = await Promise.allSettled(
    missingServers.map(async (server) => {
      let keyId = "";
      let accessUrl = "";

      if (server.type === "outline" || !server.type) {
        const keyName = `${server.name} - ${client.name}`;
        const key = await createOutlineKey(server.api_url, keyName);
        keyId = key.id;
        accessUrl = key.accessUrl;
      } else if (server.type === "hysteria2") {
        const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
        const userPass = crypto.randomBytes(3).toString('hex');
        await createHysteriaUser(server.api_url, token, client.name, userPass);
        
        keyId = userPass;
        accessUrl = buildHysteriaUri(server.api_url, client.name, userPass, `${server.name} - ${client.name}`);
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
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  
  if (failed > 0) {
    return { success: true, warning: `Synced keys on ${missingServers.length - failed} servers. ${failed} failed.` };
  }
  return { success: true, message: `Successfully synced keys on ${missingServers.length} servers.` };
}
