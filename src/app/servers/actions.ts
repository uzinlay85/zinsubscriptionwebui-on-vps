"use server";

import { supabaseAdmin } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { createOutlineKey } from "@/lib/outline";
import { loginHysteria, createHysteriaUser, buildHysteriaUri } from "@/lib/hysteria2";
import crypto from "crypto";

export async function addServer(formData: FormData) {
  const type = formData.get("type") as string || "outline";
  let name = formData.get("name") as string;
  const apiUrl = formData.get("apiUrl") as string;
  const certSha256 = formData.get("certSha256") as string;
  const authUsername = formData.get("authUsername") as string;
  const authPassword = formData.get("authPassword") as string;
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const externalDomain = formData.get("externalDomain") as string;
  const externalPortStr = formData.get("externalPort") as string;

  const finalUsername = type === "3x-ui" ? username : authUsername;
  const finalPassword = type === "3x-ui" ? password : authPassword;
  const externalPort = externalPortStr ? parseInt(externalPortStr, 10) : null;

  if (!name || !apiUrl) {
    return { error: "Name and API URL are required" };
  }

  // --- Auto GeoIP Flag ---
  try {
    const urlObj = new URL(apiUrl);
    const hostname = urlObj.hostname;
    const geoRes = await fetch(`http://ip-api.com/json/${hostname}?fields=status,countryCode`, { next: { revalidate: 3600 } });
    const geoData = await geoRes.json();
    if (geoData.status === "success" && geoData.countryCode) {
      // Convert 2-letter code to Emoji Flag
      const codePoints = geoData.countryCode
        .toUpperCase()
        .split('')
        .map((char: string) => 127397 + char.charCodeAt(0));
      const flag = String.fromCodePoint(...codePoints);
      
      // Only prepend if the user hasn't already added a flag or the same text
      if (!name.includes(flag)) {
        name = `${flag} ${name}`;
      }
    }
  } catch (err) {
    // Ignore geo lookup errors to not block server creation
    console.error("GeoIP lookup failed:", err);
  }
  // -----------------------
  if (type === "outline" && !certSha256) {
    return { error: "Cert SHA-256 is required for Outline" };
  }
  if ((type === "hysteria2" || type === "3x-ui") && (!finalUsername || !finalPassword)) {
    return { error: "Username and Password are required for this server type" };
  }

  const inboundIdStr = formData.get("inboundId") as string;
  let inboundId: number | null = null;
  let hy2Token = "";
  let cookie3xui = "";

  if (type === "3x-ui") {
    inboundId = parseInt(inboundIdStr, 10);
    if (isNaN(inboundId)) {
      return { error: "Valid Inbound ID is required for 3x-ui" };
    }
    
    // Verify 3x-ui connection
    try {
      const { login3xui } = await import("@/lib/3x-ui");
      cookie3xui = await login3xui(apiUrl, finalUsername, finalPassword);
    } catch (err: any) {
      return { error: `Failed to connect to 3x-ui panel: ${err.message}` };
    }
  } else if (type === "hysteria2") {
    // Verify Hysteria2 connection
    try {
      hy2Token = await loginHysteria(apiUrl, finalUsername, finalPassword);
    } catch (err: any) {
      return { error: `Failed to connect to Hysteria2 server: ${err.message}` };
    }
  }

  // 2. Create the server record
  const { data: newServer, error: serverError } = await supabaseAdmin
    .from("servers")
    .insert({ 
      name, 
      api_url: apiUrl, 
      cert_sha256: certSha256 || "none",
      type,
      auth_username: finalUsername || null,
      auth_password: finalPassword || null,
      username: username || null,
      password: password || null,
      inbound_id: inboundId,
      external_domain: externalDomain || null,
      external_port: externalPort
    })
    .select()
    .single();

  if (serverError || !newServer) {
    return { error: serverError?.message || "Failed to create server" };
  }

  const server = newServer as any;

  // 3. Fetch all existing active clients
  const { data: clientsData } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("status", "active");
  const clients = (clientsData as any[]) || [];

  // 4. Auto-generate a key on this new server for every existing client

  const results = await Promise.allSettled(
    clients.map(async (client) => {
      let keyId = "";
      let accessUrl = "";
      let uuid = null;

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
        accessUrl = buildHysteriaUri(apiUrl, client.name, userPass, `${name} - ${client.name}`);
      } else if (type === "3x-ui") {
        const { addClient3xui } = await import("@/lib/3x-ui");
        uuid = crypto.randomUUID();
        // Pass the server object so it can use external settings
        const rawUri = await addClient3xui(apiUrl, cookie3xui, inboundId as number, client.name, uuid, `${name} - ${client.name}`, server);
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

  const failed = results.filter((r) => r.status === "rejected").length;

  revalidatePath("/servers");
  revalidatePath("/clients");
  if (failed > 0) {
    return { success: true, warning: `${failed} client(s) failed to get keys.` };
  }
  return { success: true };
}

export async function deleteServer(id: string) {
  // 1. Delete all client_keys associated with this server first to avoid orphan records
  await supabaseAdmin.from("client_keys").delete().eq("server_id", id);

  // 2. Delete the server
  const { error } = await supabaseAdmin.from("servers").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/servers");
  revalidatePath("/clients");
  return { success: true };
}

export async function updateServer(formData: FormData) {
  const id = formData.get("id") as string;
  const type = formData.get("type") as string;
  let name = formData.get("name") as string;
  const apiUrl = formData.get("apiUrl") as string;
  const certSha256 = formData.get("certSha256") as string;
  const authUsername = formData.get("authUsername") as string;
  const authPassword = formData.get("authPassword") as string;
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const externalDomain = formData.get("externalDomain") as string;
  const externalPortStr = formData.get("externalPort") as string;

  const finalUsername = type === "3x-ui" ? username : authUsername;
  const finalPassword = type === "3x-ui" ? password : authPassword;
  const externalPort = externalPortStr ? parseInt(externalPortStr, 10) : null;

  if (!id || !name || !apiUrl) {
    return { error: "ID, Name, and API URL are required" };
  }

  // --- Auto GeoIP Flag ---
  try {
    const urlObj = new URL(apiUrl);
    const hostname = urlObj.hostname;
    const geoRes = await fetch(`http://ip-api.com/json/${hostname}?fields=status,countryCode`, { next: { revalidate: 3600 } });
    const geoData = await geoRes.json();
    if (geoData.status === "success" && geoData.countryCode) {
      // Convert 2-letter code to Emoji Flag
      const codePoints = geoData.countryCode
        .toUpperCase()
        .split('')
        .map((char: string) => 127397 + char.charCodeAt(0));
      const flag = String.fromCodePoint(...codePoints);
      
      // Only prepend if the user hasn't already added a flag or the same text
      if (!name.includes(flag)) {
        name = `${flag} ${name}`;
      }
    }
  } catch (err) {
    console.error("GeoIP lookup failed:", err);
  }
  // -----------------------

  const inboundIdStr = formData.get("inboundId") as string;
  let inboundId: number | null = null;

  if (type === "3x-ui") {
    inboundId = parseInt(inboundIdStr, 10);
    if (isNaN(inboundId)) {
      return { error: "Valid Inbound ID is required for 3x-ui" };
    }
    try {
      const { login3xui } = await import("@/lib/3x-ui");
      await login3xui(apiUrl, finalUsername, finalPassword);
    } catch (err: any) {
      return { error: `Failed to connect to 3x-ui panel: ${err.message}` };
    }
  } else if (type === "hysteria2") {
    try {
      await loginHysteria(apiUrl, finalUsername, finalPassword);
    } catch (err: any) {
      return { error: `Failed to authenticate with Hysteria2 Server. ${err.message}` };
    }
  }

  const { error } = await supabaseAdmin
    .from("servers")
    .update({ 
      name, 
      api_url: apiUrl, 
      cert_sha256: certSha256 || "none",
      auth_username: finalUsername || null,
      auth_password: finalPassword || null,
      username: username || null,
      password: password || null,
      inbound_id: inboundId,
      external_domain: externalDomain || null,
      external_port: externalPort
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/servers");
  return { success: true };
}

export async function syncServerKeys(serverId: string, selectedClientIds?: string[]) {
  // 1. Fetch server details
  const { data: serverData, error: serverError } = await supabaseAdmin
    .from("servers")
    .select("*")
    .eq("id", serverId)
    .single();

  if (serverError || !serverData) {
    return { error: "Server not found" };
  }
  const server = serverData as any;

  // 2. Fetch active clients (filter to selected if provided)
  let query = supabaseAdmin.from("clients").select("*").eq("status", "active");
  if (selectedClientIds && selectedClientIds.length > 0) {
    query = query.in("id", selectedClientIds);
  }
  const { data: clientsData } = await query;
  const clients = (clientsData as any[]) || [];

  // 3. Fetch existing keys for this server
  const { data: existingKeysData } = await supabaseAdmin
    .from("client_keys")
    .select("client_id")
    .eq("server_id", serverId);
  const existingKeys = (existingKeysData as any[]) || [];
  const existingClientIds = new Set(existingKeys.map(k => k.client_id));

  // 4. Find clients that don't have a key on this server
  const missingClients = clients.filter(c => !existingClientIds.has(c.id));

  if (missingClients.length === 0) {
    return { success: true, message: "All selected clients already have keys on this server." };
  }

  // 5. Generate keys for missing clients
  let hy2Token = "";
  let cookie3xui = "";
  if (server.type === "hysteria2") {
    try {
      hy2Token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
    } catch (err: any) {
      return { error: `Failed to authenticate with Hysteria2 Server. ${err.message}` };
    }
  } else if (server.type === "3x-ui") {
    try {
      const { login3xui } = await import("@/lib/3x-ui");
      const finalUsername = server.username || server.auth_username;
      const finalPassword = server.password || server.auth_password;
      cookie3xui = await login3xui(server.api_url, finalUsername, finalPassword);
    } catch (err: any) {
      return { error: `Failed to authenticate with 3x-ui panel. ${err.message}` };
    }
  }

  const results = await Promise.allSettled(
    missingClients.map(async (client) => {
      let keyId = "";
      let accessUrl = "";
      let uuid = null;

      if (server.type === "outline" || !server.type) {
        const keyName = `${server.name} - ${client.name}`;
        const key = await createOutlineKey(server.api_url, keyName);
        keyId = key.id;
        accessUrl = key.accessUrl;
      } else if (server.type === "hysteria2") {
        const userPass = crypto.randomBytes(3).toString('hex');
        await createHysteriaUser(server.api_url, hy2Token, client.name, userPass);
        keyId = userPass;
        accessUrl = buildHysteriaUri(server.api_url, client.name, userPass, `${server.name} - ${client.name}`);
      } else if (server.type === "3x-ui") {
        const { addClient3xui } = await import("@/lib/3x-ui");
        uuid = crypto.randomUUID();
        const rawUri = await addClient3xui(server.api_url, cookie3xui, server.inbound_id, client.name, uuid, `${server.name} - ${client.name}`, server);
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

  const failed = results.filter((r) => r.status === "rejected").length;
  revalidatePath("/servers");
  revalidatePath("/clients");

  if (failed > 0) {
    return { success: true, warning: `Synced ${missingClients.length - failed} clients. ${failed} failed.` };
  }
  return { success: true, message: `Successfully synced keys for ${missingClients.length} clients.` };
}

