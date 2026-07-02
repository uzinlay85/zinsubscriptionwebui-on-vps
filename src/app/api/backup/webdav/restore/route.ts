import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const { url, username, password, href } = await request.json();

    if (!url || !username || !password || !href) {
      return new NextResponse("Missing required parameters", { status: 400 });
    }

    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    
    const urlObj = new URL(url);
    const targetUrl = `${urlObj.protocol}//${urlObj.host}${href}`;

    // 1. Fetch the JSON file from WebDAV
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Authorization": authHeader
      }
    });

    if (!response.ok) {
      throw new Error(`WebDAV responded with ${response.status}: ${await response.text()}`);
    }

    const backupDataStr = await response.text();
    let backupData;
    try {
      backupData = JSON.parse(backupDataStr);
    } catch (e) {
      throw new Error("Downloaded file is not a valid JSON backup.");
    }

    if (!backupData || !backupData.data || !backupData.data.servers) {
      throw new Error("Invalid backup format structure.");
    }

    const { servers, clients, client_keys } = backupData.data;

    // 2. Restore into Database
    if (servers && servers.length > 0) {
      const { error: sErr } = await supabaseAdmin.from("servers").upsert(servers, { onConflict: 'id' });
      if (sErr) throw new Error("Failed to restore servers: " + sErr.message);
    }

    if (clients && clients.length > 0) {
      const { error: cErr } = await supabaseAdmin.from("clients").upsert(clients, { onConflict: 'id' });
      if (cErr) throw new Error("Failed to restore clients: " + cErr.message);
    }

    if (client_keys && client_keys.length > 0) {
      const { error: kErr } = await supabaseAdmin.from("client_keys").upsert(client_keys, { onConflict: 'id' });
      if (kErr) throw new Error("Failed to restore client keys: " + kErr.message);
    }

    return NextResponse.json({ success: true, message: "Cloud backup restored successfully." });
  } catch (err: any) {
    console.error("Failed to restore WebDAV backup:", err);
    return new NextResponse(err.message, { status: 500 });
  }
}
