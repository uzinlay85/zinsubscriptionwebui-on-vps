import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

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
        const res = await fetch(fetchUrl, { next: { revalidate: 60 } });
        if (res.ok) {
           const b64 = await res.text();
           const decoded = Buffer.from(b64, "base64").toString("utf-8");
           const links = decoded.split("\n").filter(l => l.trim().length > 0);
           return links.map(l => {
             const baseUrl = l.split("#")[0];
             return `${baseUrl}#${encodeURIComponent(keyLabel)}`;
           }).join("\n");
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
