import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // CRON_SECRET is required
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // 1. Fetch settings from DB
    const { data: settingsData, error: sErr } = await supabaseAdmin.from("settings").select("*");
    if (sErr || !settingsData) {
      return NextResponse.json({ success: false, message: "Settings table not found or empty." });
    }

    const settings: Record<string, string> = {};
    settingsData.forEach((r) => (settings[r.key] = r.value));

    if (settings["auto_backup_enabled"] !== "true") {
      return NextResponse.json({ success: true, message: "Auto backup is disabled." });
    }

    const url = settings["webdav_url"];
    const username = settings["webdav_username"];
    const password = settings["webdav_password"];

    if (!url || !username || !password) {
      return NextResponse.json({ success: false, message: "Incomplete WebDAV credentials." });
    }

    // 2. Fetch all tables for backup
    const { data: servers } = await supabaseAdmin.from("servers").select("*");
    const { data: clients } = await supabaseAdmin.from("clients").select("*");
    const { data: clientKeys } = await supabaseAdmin.from("client_keys").select("*");

    const backupData = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      data: {
        servers: servers || [],
        clients: clients || [],
        client_keys: clientKeys || [],
      },
    };

    // 3. Upload to WebDAV
    const dateStr = new Date().toISOString().split("T")[0];
    const timeStr = new Date().toISOString().split("T")[1].replace(/:/g, "").split(".")[0];
    const fileName = `outline_panel_backup_${dateStr}_${timeStr}.json`;

    const uploadUrl = url.endsWith("/") ? `${url}${fileName}` : `${url}/${fileName}`;
    const authHeaderWebDAV =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: authHeaderWebDAV,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backupData, null, 2),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`WebDAV responded with ${response.status}: ${await response.text()}`);
    }

    return NextResponse.json({ success: true, message: `Auto backup uploaded to ${uploadUrl}` });
  } catch (error: any) {
    console.error("Auto Backup cron failed:", error);
    return new NextResponse(error.message, { status: 500 });
  }
}
