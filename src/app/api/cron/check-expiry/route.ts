import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { setOutlineDataLimit } from "@/lib/outline";
import { loginHysteria, disableHysteriaUser } from "@/lib/hysteria2";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // CRON_SECRET is required
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // 1. Fetch all active clients that have passed their expiry date
    const now = new Date().toISOString();
    const { data: expiredClients, error: clientsError } = await supabaseAdmin
      .from("clients")
      .select("id, name")
      .eq("status", "active")
      .not("expiry_date", "is", null)
      .lte("expiry_date", now);

    if (clientsError) {
      console.error("Error fetching expired clients:", clientsError);
      return new NextResponse("Internal server error", { status: 500 });
    }

    if (!expiredClients || expiredClients.length === 0) {
      return NextResponse.json({ success: true, message: "No newly expired clients found." });
    }

    const expiredIds = expiredClients.map((c) => c.id);

    // 2. Fetch all keys for these clients with full server details
    const { data: keysData, error: keysError } = await supabaseAdmin
      .from("client_keys")
      .select("*, servers(api_url, type, auth_username, auth_password, username, password, inbound_id), clients(name)")
      .in("client_id", expiredIds);

    if (keysError) {
      console.error("Error fetching keys for expired clients:", keysError);
      return new NextResponse("Internal server error", { status: 500 });
    }

    const keys = (keysData as any[]) || [];

    // 3. Block all key types on their respective servers
    let disabledOutline = 0;
    let disabledHysteria = 0;
    let disabled3xui = 0;

    await Promise.allSettled(
      keys.map(async (key) => {
        const server = key.servers;
        if (!server || !key.outline_key_id) return;

        // --- Outline: set 1-byte data limit ---
        if (server.type === "outline" || !server.type) {
          try {
            await setOutlineDataLimit(server.api_url, key.outline_key_id, 1);
            disabledOutline++;
          } catch (e) {
            console.error(`Failed to limit Outline key ${key.outline_key_id}`, e);
          }
        }

        // --- Hysteria2: set expiry_days to 0 (blocks immediately) ---
        else if (server.type === "hysteria2") {
          try {
            const token = await loginHysteria(server.api_url, server.auth_username, server.auth_password);
            const clientName = key.clients?.name || "";
            await disableHysteriaUser(server.api_url, token, key.outline_key_id, clientName);
            disabledHysteria++;
          } catch (e) {
            console.error(`Failed to disable Hysteria2 user for key ${key.outline_key_id}`, e);
          }
        }

        // --- 3x-ui: disable the client on the inbound ---
        else if (server.type === "3x-ui") {
          try {
            const { login3xui } = await import("@/lib/3x-ui");
            const finalUsername = server.username || server.auth_username;
            const finalPassword = server.password || server.auth_password;
            const cookie = await login3xui(server.api_url, finalUsername, finalPassword);
            const cleanUrl = server.api_url.replace(/\/$/, "");

            // Fetch the inbound to get current client settings
            const getRes = await fetch(
              `${cleanUrl}/panel/api/inbounds/get/${server.inbound_id}`,
              { headers: { Cookie: cookie, Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
            );
            const getData = await getRes.json().catch(() => null);
            if (!getData?.success || !getData.obj) return;

            const inbound = getData.obj;
            const settings = typeof inbound.settings === "string"
              ? JSON.parse(inbound.settings)
              : inbound.settings;

            // Find client by uuid/id and set enable: false
            const updated = settings.clients?.map((c: any) => {
              if (c.id === key.outline_key_id || c.password === key.outline_key_id) {
                return { ...c, enable: false };
              }
              return c;
            });

            if (!updated) return;
            inbound.settings = JSON.stringify({ ...settings, clients: updated });

            const updateRes = await fetch(`${cleanUrl}/panel/api/inbounds/update/${server.inbound_id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Cookie: cookie, Accept: "application/json" },
              body: JSON.stringify(inbound),
              signal: AbortSignal.timeout(8000),
            });
            const updateData = await updateRes.json().catch(() => null);
            if (updateData?.success) disabled3xui++;
          } catch (e) {
            console.error(`Failed to disable 3x-ui client for key ${key.outline_key_id}`, e);
          }
        }
      })
    );

    // 4. Mark the clients as expired in Supabase
    await supabaseAdmin.from("clients").update({ status: "expired" }).in("id", expiredIds);

    return NextResponse.json({
      success: true,
      expiredClients: expiredIds.length,
      disabledOutlineKeys: disabledOutline,
      disabledHysteriaUsers: disabledHysteria,
      disabled3xuiClients: disabled3xui,
    });
  } catch (error: any) {
    console.error("Cron expiry check failed:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

