"use server";

import { supabaseAdmin } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { createOutlineKey, deleteOutlineKey, setOutlineDataLimit, removeOutlineDataLimit, fetchOutlineMetrics } from "@/lib/outline";
import { loginHysteria, createHysteriaUser, buildHysteriaUri, deleteHysteriaUser, updateHysteriaUser, enableHysteriaUser, disableHysteriaUser } from "@/lib/hysteria2";
import crypto from "crypto";

export async function addClient(formData: FormData) {
  const name = formData.get("name") as string;
  const expiryDate = formData.get("expiryDate") as string || null;
  const dataLimitStr = formData.get("dataLimitGb") as string;
  const dataLimitGb = dataLimitStr ? parseInt(dataLimitStr, 10) : null;

  if (!name) {
    return { error: "Name is required" };
  }

  // Parse selected server IDs from form (comma-separated)
  const selectedServerIdsStr = formData.get("selectedServerIds") as string;
  const selectedServerIds = selectedServerIdsStr
    ? selectedServerIdsStr.split(",").filter(Boolean)
    : null;

  // 1. Create the client record
  const { data: newClient, error: clientError } = await supabaseAdmin
    .from("clients")
    .insert({ name, expiry_date: expiryDate, data_limit_gb: dataLimitGb })
    .select()
    .single();

  if (clientError || !newClient) {
    return { error: clientError?.message || "Failed to create client" };
  }

  const client = newClient as any;

  // 2. Fetch servers and filter by selection
  const { data: serversData } = await supabaseAdmin.from("servers").select("*");
  const allServers = (serversData as any[]) || [];
  const servers = selectedServerIds && selectedServerIds.length > 0
    ? allServers.filter((s) => selectedServerIds.includes(s.id))
    : allServers;

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
        const rawUri = await addClient3xui(server.api_url, cookie, server.inbound_id, name, uuid, `${server.name} - ${name}`, server);
        keyId = uuid;
        accessUrl = rawUri;
      }

      await supabaseAdmin.from("client_keys").insert({
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
  const dataLimitStr = formData.get("dataLimitGb") as string;
  const dataLimitGb = dataLimitStr ? parseInt(dataLimitStr, 10) : null;

  const startNo = parseInt(startStr, 10);
  const endNo = parseInt(endStr, 10);

  if (!baseName || isNaN(startNo) || isNaN(endNo) || startNo < 1 || endNo < startNo) {
    return { error: "Valid Base Name, Start Number, and End Number are required" };
  }

  if (endNo - startNo + 1 > 50) {
    return { error: "Maximum 50 clients allowed per bulk request to prevent timeouts." };
  }

  // Parse selected server IDs (comma-separated)
  const selectedServerIdsStr = formData.get("selectedServerIds") as string;
  const selectedServerIds = selectedServerIdsStr
    ? selectedServerIdsStr.split(",").filter(Boolean)
    : null;

  // 1. Fetch all existing servers and filter by selection
  const { data: serversData } = await supabaseAdmin.from("servers").select("*");
  const allServers = (serversData as any[]) || [];
  const servers = selectedServerIds && selectedServerIds.length > 0
    ? allServers.filter((s) => selectedServerIds.includes(s.id))
    : allServers;

  const createdClients: Array<{ name: string; sub_token: string }> = [];
  let totalFailedKeys = 0;

  // Process sequentially to avoid overwhelming the APIs and DB
  for (let i = startNo; i <= endNo; i++) {
    const clientName = `${baseName}-${i}`;

    // 2. Create the client record
    const { data: newClient, error: clientError } = await supabaseAdmin
      .from("clients")
      .insert({ name: clientName, expiry_date: expiryDate, data_limit_gb: dataLimitGb })
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
          const rawUri = await addClient3xui(server.api_url, cookie, server.inbound_id, client.name, uuid, `${server.name} - ${client.name}`, server);
          keyId = uuid;
          accessUrl = rawUri;
        }

        await supabaseAdmin.from("client_keys").insert({
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
  const dataLimitStr = formData.get("dataLimitGb") as string;
  const dataLimitGb = dataLimitStr ? parseInt(dataLimitStr, 10) : null;

  if (!id || !name) {
    return { error: "ID and Name are required" };
  }

  // 1. Update the client in Supabase
  const { error } = await supabaseAdmin
    .from("clients")
    .update({ name, expiry_date: expiryDate, data_limit_gb: dataLimitGb })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  // 2. Fetch all keys to update them on servers
  const { data: keysData } = await supabaseAdmin
    .from("client_keys")
    .select("*, servers(api_url, type, auth_username, auth_password, username, password, inbound_id)")
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
    await supabaseAdmin.from("clients").update({ status: "active" }).eq("id", id);
  }

  await Promise.allSettled(
    keys.map(async (key) => {
      const server = key.servers;
      if (!server || !key.outline_key_id) return;

      if (server.type === "outline" || !server.type) {
        if (!isExpired) {
          // Remove data limit so the client can reconnect
          await removeOutlineDataLimit(server.api_url, key.outline_key_id).catch(() => {});
        } else {
          await setOutlineDataLimit(server.api_url, key.outline_key_id, 1).catch(() => {});
        }
      } else if (server.type === "hysteria2") {
        try {
          const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
          if (!isExpired) {
            // Re-enable with new expiry
            await enableHysteriaUser(server.api_url, token, key.outline_key_id, name, expiryDays);
          } else {
            await disableHysteriaUser(server.api_url, token, key.outline_key_id, name);
          }
        } catch (err) {
          console.error("Failed to update Hysteria user", err);
        }
      } else if (server.type === "3x-ui" && !isExpired) {
        // Re-enable 3x-ui client when renewing
        try {
          const { login3xui } = await import("@/lib/3x-ui");
          const finalUsername = server.username || server.auth_username;
          const finalPassword = server.password || server.auth_password;
          const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
          const cleanUrl = server.api_url.replace(/\/$/, "");
          const getRes = await fetch(`${cleanUrl}/panel/api/inbounds/get/${server.inbound_id}`, {
            headers: { Cookie: cookie, Accept: "application/json" }, signal: AbortSignal.timeout(8000)
          });
          const getData = await getRes.json().catch(() => null);
          if (!getData?.success || !getData.obj) return;
          const inbound = getData.obj;
          const settings = typeof inbound.settings === "string" ? JSON.parse(inbound.settings) : inbound.settings;
          const updated = settings.clients?.map((c: any) => {
            if (c.id === key.outline_key_id || c.password === key.outline_key_id) {
              return { ...c, enable: true };
            }
            return c;
          });
          if (!updated) return;
          inbound.settings = JSON.stringify({ ...settings, clients: updated });
          await fetch(`${cleanUrl}/panel/api/inbounds/update/${server.inbound_id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie, Accept: "application/json" },
            body: JSON.stringify(inbound),
            signal: AbortSignal.timeout(8000),
          });
        } catch (err) {
          console.error("Failed to re-enable 3x-ui client", err);
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
  const { data: keysData } = await supabaseAdmin
    .from("client_keys")
    .select("*, servers(id, api_url, type, auth_username, auth_password, username, password, inbound_id), clients(name)")
    .eq("client_id", id);

  const keys = (keysData as any[]) || [];

  // 2. Delete each key from the respective server in parallel
  const deletionResults = await Promise.allSettled(
    keys.map(async (key) => {
      const server = key.servers;
      if (server?.api_url && key.outline_key_id) {
        if (server.type === "outline" || !server.type) {
          await deleteOutlineKey(server.api_url, key.outline_key_id);
        } else if (server.type === "hysteria2") {
          const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
          await deleteHysteriaUser(server.api_url, token, key.outline_key_id, key.clients?.name);
        } else if (server.type === "3x-ui") {
          const { login3xui, deleteClient3xui } = await import("@/lib/3x-ui");
          const finalUsername = server.username || server.auth_username;
          const finalPassword = server.password || server.auth_password;
          const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
          
          await deleteClient3xui(server.api_url, cookie, server.inbound_id, key.outline_key_id);
        }
      }
    })
  );

  // 3. Check for failures (Strict Fail-Safe Logic)
  const failedDeletions = deletionResults.filter(r => r.status === "rejected") as PromiseRejectedResult[];
  if (failedDeletions.length > 0) {
    const errorMsg = failedDeletions.map(r => r.reason?.message || "Unknown error").join(" | ");
    return { error: `Remote Deletion Failed: ${errorMsg}` };
  }

  // 3. Delete the client from DB (client_keys will cascade or be deleted too)
  const { error } = await supabaseAdmin.from("clients").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/clients");
  return { success: true };
}

export async function toggleClientStatus(id: string, currentStatus: string) {
  const newStatus = currentStatus === "active" ? "inactive" : "active";
  const isActivating = newStatus === "active"; // true = turning ON, false = turning OFF

  // 1. Update status in DB
  const { error } = await supabaseAdmin.from("clients").update({ status: newStatus }).eq("id", id);
  if (error) {
    return { error: error.message };
  }

  // 2. Fetch client name + all keys with server details
  const { data: clientData } = await supabaseAdmin.from("clients").select("name").eq("id", id).single();
  const clientName = (clientData as any)?.name || "";

  const { data: keysData } = await supabaseAdmin
    .from("client_keys")
    .select("*, servers(api_url, type, auth_username, auth_password, username, password, inbound_id)")
    .eq("client_id", id);
  const keys = (keysData as any[]) || [];

  // 3. Block or unblock keys on every server type
  await Promise.allSettled(
    keys.map(async (key) => {
      const server = key.servers;
      if (!server || !key.outline_key_id) return;

      // Outline
      if (server.type === "outline" || !server.type) {
        if (isActivating) {
          await removeOutlineDataLimit(server.api_url, key.outline_key_id).catch(() => {});
        } else {
          await setOutlineDataLimit(server.api_url, key.outline_key_id, 1).catch(() => {});
        }
      }

      // Hysteria2
      else if (server.type === "hysteria2") {
        try {
          const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
          if (isActivating) {
            // Restore unlimited expiry (null = no expiry set by panel)
            await enableHysteriaUser(server.api_url, token, key.outline_key_id, clientName, null);
          } else {
            await disableHysteriaUser(server.api_url, token, key.outline_key_id, clientName);
          }
        } catch (err) {
          console.error("Failed to toggle Hysteria2 user", err);
        }
      }

      // 3x-ui
      else if (server.type === "3x-ui") {
        try {
          const { login3xui } = await import("@/lib/3x-ui");
          const finalUsername = server.username || server.auth_username;
          const finalPassword = server.password || server.auth_password;
          const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
          const cleanUrl = server.api_url.replace(/\/$/, "");
          const getRes = await fetch(`${cleanUrl}/panel/api/inbounds/get/${server.inbound_id}`, {
            headers: { Cookie: cookie, Accept: "application/json" }, signal: AbortSignal.timeout(8000)
          });
          const getData = await getRes.json().catch(() => null);
          if (!getData?.success || !getData.obj) return;
          const inbound = getData.obj;
          const settings = typeof inbound.settings === "string" ? JSON.parse(inbound.settings) : inbound.settings;
          const updated = settings.clients?.map((c: any) => {
            if (c.id === key.outline_key_id || c.password === key.outline_key_id) {
              return { ...c, enable: isActivating };
            }
            return c;
          });
          if (!updated) return;
          inbound.settings = JSON.stringify({ ...settings, clients: updated });
          await fetch(`${cleanUrl}/panel/api/inbounds/update/${server.inbound_id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie, Accept: "application/json" },
            body: JSON.stringify(inbound),
            signal: AbortSignal.timeout(8000),
          });
        } catch (err) {
          console.error("Failed to toggle 3x-ui client", err);
        }
      }
    })
  );

  revalidatePath("/clients");
  return { success: true };
}

export async function syncClientKeys(clientId: string) {
  // 1. Fetch client details
  const { data: clientData, error: clientError } = await supabaseAdmin
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
  const { data: serversData } = await supabaseAdmin.from("servers").select("*");
  const servers = (serversData as any[]) || [];

  // 3. Fetch existing keys for this client
  const { data: existingKeysData } = await supabaseAdmin
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
        const rawUri = await addClient3xui(server.api_url, cookie, server.inbound_id, client.name, uuid, `${server.name} - ${client.name}`, server);
        keyId = uuid;
        accessUrl = rawUri;
      }

      await supabaseAdmin.from("client_keys").insert({
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

export async function resetClientUsage(clientId: string) {
  // 1. Reset total_usage_bytes and status to active in database
  const { error } = await supabaseAdmin
    .from("clients")
    .update({ total_usage_bytes: 0, status: "active" })
    .eq("id", clientId);

  if (error) {
    return { error: error.message };
  }

  // 2. Fetch all keys for this client to get server details
  const { data: keysData } = await supabaseAdmin
    .from("client_keys")
    .select("*, servers(*)")
    .eq("client_id", clientId);
    
  const keys = (keysData as any[]) || [];

  // Group keys by server to fetch metrics
  const serversMap = new Map<string, any>();
  keys.forEach(k => {
    if (k.servers) serversMap.set(k.servers.id, k.servers);
  });

  const serverMetricsMap = new Map<string, Record<string, number>>();

  // Fetch metrics from each server
  await Promise.all(
    Array.from(serversMap.values()).map(async (server: any) => {
      if (server.type === "outline" || !server.type) {
        const metrics = await fetchOutlineMetrics(server.api_url);
        serverMetricsMap.set(server.id, metrics);
      } else if (server.type === "3x-ui") {
        try {
          const { login3xui } = await import("@/lib/3x-ui");
          const finalUsername = server.username || server.auth_username;
          const finalPassword = server.password || server.auth_password;
          const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
          
          const cleanUrl = server.api_url.replace(/\/$/, "");
          const res = await fetch(`${cleanUrl}/panel/api/inbounds/getClientTraffics`, {
            headers: { "Cookie": cookie, "Accept": "application/json" }
          });
          
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.obj) {
              const metrics: Record<string, number> = {};
              json.obj.forEach((c: any) => {
                metrics[c.email] = (c.up || 0) + (c.down || 0);
              });
              serverMetricsMap.set(server.id, metrics);
            }
          }
        } catch (e) {
          console.error("Failed to fetch 3x-ui metrics during reset", e);
        }
      }
    })
  );

  // 3. Remove data limits on Outline servers and update last_seen_bytes to current usage
  const { data: clientData } = await supabaseAdmin.from("clients").select("name").eq("id", clientId).single();
  const clientName = clientData?.name || "";

  await Promise.allSettled(
    keys.map(async (key) => {
      const server = key.servers;
      if (!server) return;

      if ((server.type === "outline" || !server.type) && key.outline_key_id) {
        await removeOutlineDataLimit(server.api_url, key.outline_key_id).catch(() => {});
      }

      // Find current bytes
      const metrics = serverMetricsMap.get(server.id) || {};
      let currentBytes = 0;
      if (server.type === "outline" || !server.type) {
        currentBytes = metrics[key.outline_key_id] || 0;
      } else if (server.type === "3x-ui") {
        const keyName = `${server.name} - ${clientName}`;
        currentBytes = metrics[keyName] || metrics[clientName] || metrics[key.uuid] || 0;
      }

      // Update last_seen_bytes to current bytes so delta starts at 0
      await supabaseAdmin
        .from("client_keys")
        .update({ last_seen_bytes: currentBytes })
        .eq("id", key.id);
    })
  );

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}
