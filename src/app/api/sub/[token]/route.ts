import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "base64"; // base64 or text

  if (!token) {
    return new NextResponse("Token is missing", { status: 400 });
  }

  // Fetch the client using the token
  const { data, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("sub_token", token)
    .single();

  const client = data as { id: string; name: string; status: string; expiry_date: string | null } | null;

  if (clientError || !client) {
    return new NextResponse("Invalid subscription token", { status: 401 });
  }

  if (client.status !== "active") {
    return new NextResponse("Subscription is inactive", { status: 403 });
  }

  if (client.expiry_date && new Date(client.expiry_date).getTime() <= new Date().getTime()) {
    return new NextResponse("Subscription has expired. Please renew.", { status: 403 });
  }

  // Fetch all access keys for this client, joined with server name
  const { data: keysData, error: keysError } = await supabase
    .from("client_keys")
    .select("*, servers(name, api_url, type)")
    .eq("client_id", client.id);

  const clientKeys = keysData as {
    access_url: string;
    servers: { name: string; api_url: string; type: string } | null;
  }[] | null;

  if (keysError || !clientKeys) {
    return new NextResponse("Error fetching keys", { status: 500 });
  }

  // Calculate Expiry Info
  let userinfoHeader = "";
  let dummyNode = "";
  if (client.expiry_date) {
    const expiryTime = new Date(client.expiry_date).getTime();
    const now = new Date().getTime();
    const leftDays = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));
    const expirySeconds = Math.floor(expiryTime / 1000);
    
    // HTTP Header standard for modern clients (Nekobox, v2rayN, Shadowrocket)
    // using 1000GB as dummy total data to prevent clients from thinking it's empty
    userinfoHeader = `upload=0; download=0; total=1099511627776000; expire=${expirySeconds}`;

    const dateStr = new Date(client.expiry_date).toISOString().split('T')[0];
    const nodeName = leftDays > 0 ? `⏳ Expire: ${dateStr} (${leftDays} Days Left)` : `❌ Expired: ${dateStr}`;
    
    // Dummy Shadowsocks node just to show the text at the top of the server list
    // Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpkdW1teQ== is base64 of "chacha20-ietf-poly1305:dummy"
    dummyNode = `ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpkdW1teQ==@127.0.0.1:80#${encodeURIComponent(nodeName)}\n`;
  }

  // Build URL list
  const urlsArray = await Promise.all(clientKeys.map(async (k) => {
    const serverName = k.servers?.name ?? "Server";
    const keyLabel = `${serverName} - ${client.name}`;
    
    if (k.access_url.startsWith("3x-ui-sub:")) {
      const uuid = k.access_url.split(":")[1];
      const apiUrl = k.servers?.api_url;
      if (!apiUrl) return null;
      try {
        const fetchUrl = `${apiUrl}/sub/${uuid}`;
        // Revalidate sublinks every 60 seconds so it doesn't block constantly
        // Add User-Agent to avoid 3x-ui blocking the request
        const res = await fetch(fetchUrl, { 
          next: { revalidate: 60 },
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
          }
        });
        if (res.ok) {
           const bodyText = await res.text();
           let decoded = bodyText;
           // 3x-ui can return base64 OR plain text depending on User-Agent.
           // If the text does not contain '://', we assume it's base64 encoded.
           if (!bodyText.includes("://")) {
             try {
               decoded = Buffer.from(bodyText, "base64").toString("utf-8");
             } catch (e) {
               // Ignore decode error and fallback to bodyText
             }
           }
           
           const links = decoded.split("\n").filter(l => l.trim().length > 0);
           return links.map(l => {
             const baseUrl = l.split("#")[0];
             return `${baseUrl}#${encodeURIComponent(keyLabel)}`;
           }).join("\n");
        } else {
           console.error(`3x-ui sub fetch failed with status ${res.status}`);
        }
      } catch (err) {
        console.error("Failed to fetch 3x-ui sub link", err);
      }
      return null;
    } else {
      const baseUrl = k.access_url.split("#")[0];
      return `${baseUrl}#${encodeURIComponent(keyLabel)}`;
    }
  }));

  const urls = urlsArray.filter(u => u !== null).join("\n");
  const finalUrls = dummyNode + urls;

  if (format === "text") {
    return new NextResponse(finalUrls, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        ...(userinfoHeader ? { "Subscription-Userinfo": userinfoHeader } : {}),
      },
    });
  }

  // Base64 encode the string (standard for V2Ray / Shadowsocks subscriptions)
  const base64Urls = Buffer.from(finalUrls).toString("base64");

  return new NextResponse(base64Urls, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      ...(userinfoHeader ? { "Subscription-Userinfo": userinfoHeader } : {}),
    },
  });
}
