import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import http from "http";
import https from "https";

export const dynamic = 'force-dynamic';

function pingServer(apiUrl: string): Promise<{ online: boolean; latency?: number }> {
  return new Promise((resolve) => {
    try {
      const startTime = Date.now();
      const url = new URL(apiUrl);
      
      const isHttps = url.protocol === "https:";
      const client = isHttps ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname || "/",
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        rejectUnauthorized: false, // Bypass SSL certificate checks for self-signed certificates
      };

      const req = client.request(options, (res) => {
        // Read response to trigger end, we don't need body
        res.on("data", () => {});
        res.on("end", () => {
          resolve({
            online: true,
            latency: Date.now() - startTime
          });
        });
      });

      req.setTimeout(2500, () => {
        req.destroy();
        resolve({ online: false });
      });

      req.on("error", () => {
        resolve({ online: false });
      });

      req.end();
    } catch {
      resolve({ online: false });
    }
  });
}

export async function GET() {
  try {
    const { data: serversData, error } = await supabase
      .from("servers")
      .select("id, api_url");
      
    if (error || !serversData) {
      return NextResponse.json({ error: error?.message || "Failed to fetch servers" }, { status: 500 });
    }

    const statuses: Record<string, { online: boolean; latency?: number }> = {};
    
    await Promise.all(
      serversData.map(async (server) => {
        const status = await pingServer(server.api_url);
        statuses[server.id] = status;
      })
    );

    return NextResponse.json({ statuses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
