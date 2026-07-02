import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { fetchOutlineMetrics } from "@/lib/outline";

export const dynamic = "force-dynamic";

export async function GET() {
  // Fetch servers to know where to poll
  const { data: serversData } = await supabaseAdmin
    .from("servers")
    .select("id, api_url, type");
  const servers = (serversData as any[]) || [];

  const metricsMap: Record<string, Record<string, number>> = {};

  await Promise.all(
    servers.map(async (server) => {
      // Only Outline natively supports /metrics/transfer in this structure
      if (!server.type || server.type === "outline") {
        metricsMap[server.id] = await fetchOutlineMetrics(server.api_url);
      }
    })
  );

  return NextResponse.json({ metricsMap });
}
