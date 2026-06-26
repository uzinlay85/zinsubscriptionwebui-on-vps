import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { setOutlineDataLimit } from "@/lib/outline";

export async function GET(request: Request) {
  // Optional: Protect the route with a cron secret if configured
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // 1. Fetch all active clients that have passed their expiry date
    const now = new Date().toISOString();
    const { data: expiredClients, error: clientsError } = await supabase
      .from("clients")
      .select("id")
      .eq("status", "active")
      .not("expiry_date", "is", null)
      .lte("expiry_date", now);

    if (clientsError) {
      console.error("Error fetching expired clients:", clientsError);
      return new NextResponse(clientsError.message, { status: 500 });
    }

    if (!expiredClients || expiredClients.length === 0) {
      return NextResponse.json({ success: true, message: "No newly expired clients found." });
    }

    const expiredIds = expiredClients.map(c => c.id);

    // 2. Fetch all Outline keys for these clients
    const { data: keysData, error: keysError } = await supabase
      .from("client_keys")
      .select("*, servers(api_url, type)")
      .in("client_id", expiredIds);

    const keys = (keysData as any[]) || [];

    // 3. Set data limit to 1 byte for all their Outline keys to block them
    let disabledKeysCount = 0;
    await Promise.allSettled(
      keys.map(async (key) => {
        const server = key.servers;
        if (server && key.outline_key_id && (server.type === "outline" || !server.type)) {
          try {
            await setOutlineDataLimit(server.api_url, key.outline_key_id, 1);
            disabledKeysCount++;
          } catch (e) {
            console.error(`Failed to limit Outline key ${key.outline_key_id}`, e);
          }
        }
      })
    );

    // 4. Mark the clients as expired/inactive in Supabase
    await supabase
      .from("clients")
      .update({ status: "expired" }) // or inactive
      .in("id", expiredIds);

    return NextResponse.json({ 
      success: true, 
      expiredClients: expiredIds.length,
      disabledOutlineKeys: disabledKeysCount
    });

  } catch (error: any) {
    console.error("Cron expiry check failed:", error);
    return new NextResponse(error.message, { status: 500 });
  }
}
