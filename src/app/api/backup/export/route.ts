import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // Fetch all tables
    const { data: servers, error: sErr } = await supabase.from("servers").select("*");
    const { data: clients, error: cErr } = await supabase.from("clients").select("*");
    const { data: clientKeys, error: kErr } = await supabase.from("client_keys").select("*");

    if (sErr || cErr || kErr) {
      return new NextResponse("Failed to fetch database records", { status: 500 });
    }

    const backupData = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      data: {
        servers: servers || [],
        clients: clients || [],
        client_keys: clientKeys || []
      }
    };

    const fileName = `outline_panel_backup_${new Date().toISOString().split('T')[0]}.json`;

    return new NextResponse(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileName}"`
      }
    });
  } catch (error: any) {
    console.error("Export backup failed:", error);
    return new NextResponse(error.message, { status: 500 });
  }
}
