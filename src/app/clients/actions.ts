"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { createOutlineKey, deleteOutlineKey, setOutlineDataLimit, removeOutlineDataLimit } from "@/lib/outline";
import { loginHysteria, createHysteriaUser, buildHysteriaUri, deleteHysteriaUser, updateHysteriaUser } from "@/lib/hysteria2";
import crypto from "crypto";

export async function addClient(formData: FormData) {
  const name = formData.get("name") as string;
  const expiryDate = formData.get("expiryDate") as string || null;

  if (!name) {
    return { error: "Name is required" };
  }

  // 1. Create the client record
  const { data: newClient, error: clientError } = await supabase
    .from("clients")
    .insert({ name, expiry_date: expiryDate })
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
      let uuid = null;

      if (server.type === "outline" || !server.type) {
        const keyName = `${server.name} - ${name}`;
        const key = await createOutlineKey(server.api_url, keyName);
        keyId = key.id;
        accessUrl = key.accessUrl;
      } else if (server.type === "hysteria2") {
        const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
        const userPass = crypto.randomBytes(3).toString('hex');
        let expiryDays = null;
        if (expiryDate) {
          const diffTime = new Date(expiryDate).getTime() - new Date().getTime();
          expiryDays = diffTime > 0 ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : 0;
        }
        await createHysteriaUser(server.api_url, token, name, userPass, expiryDays);
        keyId = userPass;
        accessUrl = buildHysteriaUri(server.api_url, name, userPass, `${server.name} - ${name}`);
      } else if (server.type === "3x-ui") {
        const { login3xui, addClient3xui } = await import("@/lib/3x-ui");
        const finalUsername = server.username || server.auth_username;
        const finalPassword = server.password || server.auth_password;
        const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
        uuid = crypto.randomUUID();
        const rawUri = await addClient3xui(server.api_url, cookie, server.inbound_id, name, uuid, `${server.name} - ${name}`);
        keyId = uuid;
        accessUrl = rawUri;
      }

      await supabase.from("client_keys").insert({
        client_id: client.id,
        server_id: server.id,
        outline_key_id: keyId,
        access_url: accessUrl,
        uuid: uuid
      });
    })
  );

    const failedResults = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

  if (failedResults.length > 0) {
    const errorMessages = failedResults.map(r => r.reason?.message || "Unknown error").join(" | ");
    return { error: `Failed to generate keys on ${failedResults.length} servers: ${errorMessages}` };
  }
  return { success: true };
}

export async function addBulkClients(formData: FormData) {
  const baseName = formData.get("baseName") as string;
  const startStr = formData.get("startNumber") as string;
  const endStr = formData.get("endNumber") as string;
  const expiryDate = formData.get("expiryDate") as string || null;

  const startNo = parseInt(startStr, 10);
  const endNo = parseInt(endStr, 10);

  if (!baseName || isNaN(startNo) || isNaN(endNo) || startNo < 1 || endNo < startNo) {
    return { error: "Valid Base Name, Start Number, and End Number are required" };
  }

  if (endNo - startNo + 1 > 50) {
    return { error: "Maximum 50 clients allowed per bulk request to prevent timeouts." };
  }

  // 1. Fetch all existing servers
  const { data: serversData } = await supabase.from("servers").select("*");
  const servers = (serversData as any[]) || [];

  const createdClients: Array<{ name: string; sub_token: string }> = [];
  let totalFailedKeys = 0;

  // Process sequentially to avoid overwhelming the APIs and DB
  for (let i = startNo; i <= endNo; i++) {
    const clientName = `${baseName}-${i}`;

    // 2. Create the client record
    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({ name: clientName, expiry_date: expiryDate })
      .select()
      .single();

    if (clientError || !newClient) {
      console.error(`Failed to create client ${clientName}:`, clientError);
      continue; // Skip to next
    }

    const client = newClient as any;
    createdClients.push({ name: client.name, sub_token: client.sub_token });

    // 3. Generate keys for this client on all servers
    const results = await Promise.allSettled(
      servers.map(async (server) => {
        let keyId = "";
        let accessUrl = "";
        let uuid = null;

        if (server.type === "outline" || !server.type) {
          const keyName = `${server.name} - ${client.name}`;
          const key = await createOutlineKey(server.api_url, keyName);
          keyId = key.id;
          accessUrl = key.accessUrl;
        } else if (server.type === "hysteria2") {
          const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
          const userPass = crypto.randomBytes(3).toString('hex');
          
          let expiryDays = null;
          if (expiryDate) {
            const diffTime = new Date(expiryDate).getTime() - new Date().getTime();
            expiryDays = diffTime > 0 ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : 0;
          }

          await createHysteriaUser(server.api_url, token, client.name, userPass, expiryDays);
          
          keyId = userPass;
          accessUrl = buildHysteriaUri(server.api_url, client.name, userPass, `${server.name} - ${client.name}`);
        } else if (server.type === "3x-ui") {
          const { login3xui, addClient3xui } = await import("@/lib/3x-ui");
          const finalUsername = server.username || server.auth_username;
          const finalPassword = server.password || server.auth_password;
          const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
          uuid = crypto.randomUUID();
          const rawUri = await addClient3xui(server.api_url, cookie, server.inbound_id, client.name, uuid, `${server.name} - ${client.name}`);
          keyId = uuid;
          accessUrl = rawUri;
        }

        await supabase.from("client_keys").insert({
          client_id: client.id,
          server_id: server.id,
          outline_key_id: keyId,
          access_url: accessUrl,
          uuid: uuid
        });
      })
    );

    totalFailedKeys += results.filter((r) => r.status === "rejected").length;
  }
  
  if (createdClients.length === 0) {
    return { error: "Failed to create any clients." };
  }

  if (totalFailedKeys > 0) {
    return { success: true, clients: createdClients, warning: `Created ${createdClients.length} clients, but ${totalFailedKeys} key generations failed across servers.` };
  }
  
  return { success: true, clients: createdClients };
}

export async function updateClient(formData: FormData) {
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const expiryDate = formData.get("expiryDate") as string || null;

  if (!id || !name) {
    return { error: "ID and Name are required" };
  }

  // 1. Update the client in Supabase
  const { error } = await supabase
    .from("clients")
    .update({ name, expiry_date: expiryDate })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  // 2. Fetch all keys to update them on servers
  const { data: keysData } = await supabase
    .from("client_keys")
    .select("*, servers(api_url, type, auth_username, auth_password)")
    .eq("client_id", id);
    
  const keys = (keysData as any[]) || [];

  // Calculate new expiry_days
  let expiryDays = null;
  const isExpired = expiryDate ? new Date(expiryDate).getTime() <= new Date().getTime() : false;
  
  if (expiryDate && !isExpired) {
    const diffTime = new Date(expiryDate).getTime() - new Date().getTime();
    expiryDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } else if (isExpired) {
    expiryDays = 0;
  }

  // If we just extended a previously expired client, mark them as active again
  if (!isExpired) {
    await supabase.from("clients").update({ status: "active" }).eq("id", id);
  }

  await Promise.allSettled(
    keys.map(async (key) => {
      const server = key.servers;
      if (!server || !key.outline_key_id) return;

      if (server.type === "outline" || !server.type) {
        // If not expired, ensure data limit is removed so they can reconnect
        // (If expired, cron job will handle blocking them, but we could also block here)
        if (!isExpired) {
          await removeOutlineDataLimit(server.api_url, key.outline_key_id).catch(() => {});
        } else {
          await setOutlineDataLimit(server.api_url, key.outline_key_id, 1).catch(() => {});
        }
      } else if (server.type === "hysteria2") {
        try {
          const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
          await updateHysteriaUser(server.api_url, token, key.outline_key_id, name, expiryDays);
        } catch (err) {
          console.error("Failed to update Hysteria user", err);
        }
      }
    })
  );

  revalidatePath("/clients");
  return { success: true };
}

export async function deleteClient(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return { error: "ID is required" };

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
          await deleteOutlineKey(server.api_url, key.outline_key_id).catch(console.error);
        } else if (server.type === "hysteria2") {
          try {
            const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
            await deleteHysteriaUser(server.api_url, token, key.outline_key_id);
          } catch (err) {
            console.error("Failed to delete Hysteria user", err);
          }
        } else if (server.type === "3x-ui") {
          try {
            const { login3xui, deleteClient3xui } = await import("@/lib/3x-ui");
            const finalUsername = server.username || server.auth_username;
            const finalPassword = server.password || server.auth_password;
            const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
            // We need inbound_id here, let's fetch it if it's missing in `servers` joined query!
            // Wait, I need to make sure inbound_id is selected in the query above!
            const serverDetails = await supabase.from("servers").select("inbound_id").eq("id", key.server_id).single();
            const inboundId = serverDetails.data?.inbound_id;
            if (inboundId) {
              await deleteClient3xui(server.api_url, cookie, inboundId, key.outline_key_id); // we used uuid as outline_key_id
            }
          } catch (err) {
            console.error("Failed to delete 3x-ui user", err);
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
      let uuid = null;

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
      } else if (server.type === "3x-ui") {
        const { login3xui, addClient3xui } = await import("@/lib/3x-ui");
        const finalUsername = server.username || server.auth_username;
        const finalPassword = server.password || server.auth_password;
        const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
        uuid = crypto.randomUUID();
        const rawUri = await addClient3xui(server.api_url, cookie, server.inbound_id, client.name, uuid, `${server.name} - ${client.name}`);
        keyId = uuid;
        accessUrl = rawUri;
      }

      await supabase.from("client_keys").insert({
        client_id: client.id,
        server_id: server.id,
        outline_key_id: keyId,
        access_url: accessUrl,
        uuid: uuid
      });
    })
  );

  const failedResults = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  
  if (failedResults.length > 0) {
    const errorMessages = failedResults.map(r => r.reason?.message || "Unknown error").join(" | ");
    return { error: `Failed to sync on ${failedResults.length} servers. Errors: ${errorMessages}` };
  }
  return { success: true, message: `Successfully synced keys on ${missingServers.length} servers.` };
}
