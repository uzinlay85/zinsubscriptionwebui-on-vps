import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin.from("settings").select("*");
    
    // If the table doesn't exist yet (e.g. user hasn't run the SQL command),
    // Supabase will throw an error. We handle it gracefully.
    if (error) {
      if (error.code === '42P01') {
        // Table does not exist
        return NextResponse.json({ settings: {} });
      }
      return new NextResponse(error.message, { status: 500 });
    }

    // Convert array of {key, value} to an object
    const settingsObj: Record<string, string> = {};
    data?.forEach(row => {
      settingsObj[row.key] = row.value;
    });

    return NextResponse.json({ settings: settingsObj });
  } catch (err: any) {
    return new NextResponse(err.message, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { settings } = await request.json();
    
    if (!settings || typeof settings !== 'object') {
      return new NextResponse("Invalid payload", { status: 400 });
    }

    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value: String(value)
    }));

    if (updates.length > 0) {
      const { error } = await supabaseAdmin.from("settings").upsert(updates, { onConflict: 'key' });
      if (error) {
        if (error.code === '42P01') {
          return new NextResponse("Database table 'settings' does not exist. Please run the SQL command provided.", { status: 500 });
        }
        throw error;
      }
    }

    return NextResponse.json({ success: true, message: "Settings saved successfully" });
  } catch (err: any) {
    return new NextResponse(err.message, { status: 500 });
  }
}
