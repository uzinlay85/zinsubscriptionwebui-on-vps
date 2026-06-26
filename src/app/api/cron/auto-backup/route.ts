import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  // Optional: Protect the route with a cron secret if configured
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // 1. Fetch settings from DB
    const { data: settingsData, error: sErr } = await supabase.from("settings").select("*");
    if (sErr || !settingsData) {
      return NextResponse.json({ success: false, message: "Settings table not found or empty." });
    }

    const settings: Record<string, string> = {};
    settingsData.forEach(r => settings[r.key] = r.value);

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
    const { data: servers } = await supabase.from("servers").select("*");
    const { data: clients } = await supabase.from("clients").select("*");
    const { data: clientKeys } = await supabase.from("client_keys").select("*");

    const backupData = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      data: {
        servers: servers || [],
        clients: clients || [],
        client_keys: clientKeys || []
      }
    };

    // 3. Upload to WebDAV
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toISOString().split('T')[1].replace(/:/g, '').split('.')[0];
    const fileName = `outline_panel_backup_${dateStr}_${timeStr}.json`;
    
    const uploadUrl = url.endsWith('/') ? `${url}${fileName}` : `${url}/${fileName}`;
    const authHeaderWebDAV = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": authHeaderWebDAV,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(backupData, null, 2),
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
