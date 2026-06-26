import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return new NextResponse("No file uploaded", { status: 400 });
    }

    const fileText = await file.text();
    const backupData = JSON.parse(fileText);

    if (!backupData || !backupData.data || !backupData.data.servers) {
      return new NextResponse("Invalid backup format", { status: 400 });
    }

    const { servers, clients, client_keys } = backupData.data;

    // IMPORTANT: Upsert order matters due to foreign keys.
    // 1. Servers
    if (servers.length > 0) {
      const { error: sErr } = await supabase.from("servers").upsert(servers, { onConflict: 'id' });
      if (sErr) throw new Error("Failed to restore servers: " + sErr.message);
    }

    // 2. Clients
    if (clients.length > 0) {
      const { error: cErr } = await supabase.from("clients").upsert(clients, { onConflict: 'id' });
      if (cErr) throw new Error("Failed to restore clients: " + cErr.message);
    }

    // 3. Client Keys
    if (client_keys.length > 0) {
      const { error: kErr } = await supabase.from("client_keys").upsert(client_keys, { onConflict: 'id' });
      if (kErr) throw new Error("Failed to restore client keys: " + kErr.message);
    }

    return NextResponse.json({ success: true, message: "Database restored successfully." });

  } catch (error: any) {
    console.error("Import backup failed:", error);
    return new NextResponse(error.message || "Failed to process backup file", { status: 500 });
  }
}
