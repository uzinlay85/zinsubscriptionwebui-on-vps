import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import https from "https";

export const dynamic = 'force-dynamic';

async function fetchServerMetrics(apiUrl: string): Promise<Record<string, number>> {
  return new Promise((resolve) => {
    try {
      const url = new URL(`${apiUrl}/metrics/transfer`);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "GET",
        rejectUnauthorized: false,
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.bytesTransferredByUserId || {});
          } catch {
            resolve({});
          }
        });
      });
      req.on("error", () => resolve({}));
      req.end();
    } catch {
      resolve({});
    }
  });
}

export async function GET() {
  // Fetch servers to know where to poll
  const { data: serversData } = await supabase.from("servers").select("id, api_url, type");
  const servers = (serversData as any[]) || [];

  const metricsMap: Record<string, Record<string, number>> = {};
  
  await Promise.all(
    servers.map(async (server) => {
      // Only Outline natively supports /metrics/transfer in this structure
      if (!server.type || server.type === "outline") {
        metricsMap[server.id] = await fetchServerMetrics(server.api_url);
      }
    })
  );

  return NextResponse.json({ metricsMap });
}
