import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchOutlineKeys, deleteOutlineKey } from "@/lib/outline";
import { loginHysteria, fetchHysteriaUsers, deleteHysteriaUser } from "@/lib/hysteria2";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  if (!id) {
    return new NextResponse("Server ID is required", { status: 400 });
  }

  // 1. Fetch server details
  const { data: server, error: serverError } = await supabase
    .from("servers")
    .select("*")
    .eq("id", id)
    .single();

  if (serverError || !server) {
    return new NextResponse("Server not found", { status: 404 });
  }

  // 2. Fetch all keys stored in our DB for this server
  const { data: dbKeysData, error: dbKeysError } = await supabase
    .from("client_keys")
    .select("outline_key_id, uuid")
    .eq("server_id", id);

  if (dbKeysError) {
    return new NextResponse("Failed to fetch keys from database", { status: 500 });
  }

  const dbKeys = (dbKeysData || []).map(k => k.outline_key_id);
  const orphans = [];

  // 3. Fetch all keys from the Server API
  try {
    if (server.type === "outline" || !server.type) {
      const serverKeys = await fetchOutlineKeys(server.api_url);
      for (const k of serverKeys) {
        if (!dbKeys.includes(k.id)) {
          orphans.push({ id: k.id, name: k.name || "Unknown", type: "outline" });
        }
      }
    } else if (server.type === "3x-ui") {
      const { login3xui, fetch3xuiUsers } = await import("@/lib/3x-ui");
      const finalUsername = server.username || server.auth_username;
      const finalPassword = server.password || server.auth_password;
      const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
      
      const inboundId = server.inbound_id;
      if (inboundId) {
        const serverKeys = await fetch3xuiUsers(server.api_url, cookie, inboundId);
        for (const k of serverKeys) {
          // 3x-ui uses uuid as outline_key_id in our DB
          if (!dbKeys.includes(k.id)) {
            orphans.push({ id: k.id, name: k.email || "Unknown", type: "3x-ui" });
          }
        }
      }
    } else if (server.type === "hysteria2") {
      const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
      const serverKeys = await fetchHysteriaUsers(server.api_url, token);
      for (const k of serverKeys) {
        // Hysteria2 uses password as outline_key_id in our DB
        if (k.password && !dbKeys.includes(k.password)) {
          orphans.push({ id: k.password, name: k.username || "Unknown", type: "hysteria2" });
        }
      }
    }
  } catch (err: any) {
    return new NextResponse(`Failed to fetch keys from server API: ${err.message}`, { status: 500 });
  }

  return NextResponse.json({ success: true, orphans });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  if (!id) {
    return new NextResponse("Server ID is required", { status: 400 });
  }

  const body = await request.json();
  const orphanIds: string[] = body.orphanIds;

  if (!orphanIds || !Array.isArray(orphanIds) || orphanIds.length === 0) {
    return new NextResponse("No orphan IDs provided", { status: 400 });
  }

  // Fetch server details
  const { data: server, error: serverError } = await supabase
    .from("servers")
    .select("*")
    .eq("id", id)
    .single();

  if (serverError || !server) {
    return new NextResponse("Server not found", { status: 404 });
  }

  const results = [];

  try {
    if (server.type === "outline" || !server.type) {
      for (const keyId of orphanIds) {
        try {
          await deleteOutlineKey(server.api_url, keyId);
          results.push({ id: keyId, success: true });
        } catch (e: any) {
          results.push({ id: keyId, success: false, error: e.message });
        }
      }
    } else if (server.type === "3x-ui") {
      const { login3xui, deleteClient3xui } = await import("@/lib/3x-ui");
      const finalUsername = server.username || server.auth_username;
      const finalPassword = server.password || server.auth_password;
      const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
      
      const inboundId = server.inbound_id;
      if (inboundId) {
        for (const keyId of orphanIds) {
          try {
            await deleteClient3xui(server.api_url, cookie, inboundId, keyId);
            results.push({ id: keyId, success: true });
          } catch (e: any) {
            results.push({ id: keyId, success: false, error: e.message });
          }
        }
      }
    } else if (server.type === "hysteria2") {
      const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
      for (const keyId of orphanIds) {
        try {
          // deleteHysteriaUser expects the user's password (which is what we use as ID here)
          await deleteHysteriaUser(server.api_url, token, keyId);
          results.push({ id: keyId, success: true });
        } catch (e: any) {
          results.push({ id: keyId, success: false, error: e.message });
        }
      }
    }
  } catch (err: any) {
    return new NextResponse(`Server connection failed: ${err.message}`, { status: 500 });
  }

  return NextResponse.json({ success: true, results });
}
