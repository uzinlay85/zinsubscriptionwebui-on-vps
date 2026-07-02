import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { setOutlineDataLimit } from "@/lib/outline";

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

    const expiredIds = expiredClients.map((c) => c.id);

    // 2. Fetch all keys for these clients
    const { data: keysData, error: keysError } = await supabaseAdmin
      .from("client_keys")
      .select("*, servers(api_url, type)")
      .in("client_id", expiredIds);

    if (keysError) {
      return new NextResponse(keysError.message, { status: 500 });
    }

    const keys = (keysData as any[]) || [];

    // 3. Set data limit to 1 byte on Outline keys to block them
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
        // 3x-ui / hysteria2: blocked via "expired" status — dummy node shown in sub link
      })
    );

    // 4. Mark the clients as expired in Supabase
    await supabaseAdmin.from("clients").update({ status: "expired" }).in("id", expiredIds);

    return NextResponse.json({
      success: true,
      expiredClients: expiredIds.length,
      disabledOutlineKeys: disabledKeysCount,
    });
  } catch (error: any) {
    console.error("Cron expiry check failed:", error);
    return new NextResponse(error.message, { status: 500 });
  }
}
