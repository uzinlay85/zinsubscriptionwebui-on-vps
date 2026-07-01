import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/** Build a dummy Shadowsocks node that carries a display label only. */
function dummyNode(label: string): string {
  // Base64 of "chacha20-ietf-poly1305:dummy" — always the same placeholder cipher
  const cipherBase64 = "Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpkdW1teQ==";
  return `ss://${cipherBase64}@127.0.0.1:80#${encodeURIComponent(label)}`;
}

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

  const client = data as {
    id: string;
    name: string;
    status: string;
    expiry_date: string | null;
    data_limit_gb: number | null;
    total_usage_bytes: number;
  } | null;

  if (clientError || !client) {
    return new NextResponse("Invalid subscription token", { status: 401 });
  }

  const isExpired =
    client.expiry_date != null &&
    new Date(client.expiry_date).getTime() <= Date.now();

  // -----------------------------------------------------------------------
  // Inactive / Suspended account
  // Return an info-only subscription so the client app keeps the link alive
  // but the user sees a "Suspended" node instead of an error.
  // -----------------------------------------------------------------------
  if (client.status !== "active") {
    const nodes = dummyNode("🚫 Account Suspended — Contact Admin");
    const body = format === "text" ? nodes : Buffer.from(nodes).toString("base64");
    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, max-age=0" },
    });
  }

  // -----------------------------------------------------------------------
  // Expired account
  // Return an info-only subscription so the link stays alive.
  // -----------------------------------------------------------------------
  if (isExpired) {
    const dateStr = new Date(client.expiry_date!).toISOString().split("T")[0];
    const nodes = dummyNode(`❌ Subscription Expired (${dateStr}) — Please Renew`);
    const body = format === "text" ? nodes : Buffer.from(nodes).toString("base64");
    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, max-age=0" },
    });
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

  // Calculate Expiry Info and Usage Info
  let userinfoHeader = "";
  let dummyNodes = "";

  const totalUsageBytes = client.total_usage_bytes || 0;
  // Fallback to 1000 TB if unlimited so clients don't think it's 0 bytes
  const dataLimitBytes = client.data_limit_gb
    ? client.data_limit_gb * 1024 * 1024 * 1024
    : 1099511627776000;

  let expirySeconds = 0;
  if (client.expiry_date) {
    expirySeconds = Math.floor(new Date(client.expiry_date).getTime() / 1000);
  } else {
    // 10 years in the future for unlimited expiry
    expirySeconds = Math.floor(
      (Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) / 1000
    );
  }

  userinfoHeader = `upload=0; download=${totalUsageBytes}; total=${dataLimitBytes}; expire=${expirySeconds}`;

  // Dummy node 1: Data Usage
  const gbUsed = (totalUsageBytes / (1024 * 1024 * 1024)).toFixed(2);
  const dataNodeName = client.data_limit_gb
    ? `📊 Usage: ${gbUsed} GB / ${client.data_limit_gb} GB`
    : `📊 Usage: ${gbUsed} GB (Unlimited)`;

  dummyNodes += dummyNode(dataNodeName) + "\n";

  // Dummy node 2: Expiry Date (only if set)
  if (client.expiry_date) {
    const expiryTime = new Date(client.expiry_date).getTime();
    const now = Date.now();
    const leftDays = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));
    const dateStr = new Date(client.expiry_date).toISOString().split("T")[0];
    const nodeName =
      leftDays > 0
        ? `⏳ Expire: ${dateStr} (${leftDays} Days Left)`
        : `❌ Expired: ${dateStr}`;
    dummyNodes += dummyNode(nodeName) + "\n";
  }

  // Build URL list
  const urlsArray = await Promise.all(
    clientKeys.map(async (k) => {
      if (!k.servers) return null; // Skip key if its associated server has been deleted
      const serverName = k.servers.name ?? "Server";
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
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            },
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

            const links = decoded
              .split("\n")
              .filter((l) => l.trim().length > 0);
            return links
              .map((l) => {
                const baseUrl = l.split("#")[0];
                return `${baseUrl}#${encodeURIComponent(keyLabel)}`;
              })
              .join("\n");
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
    })
  );

  const urls = urlsArray.filter((u) => u !== null).join("\n");
  const finalUrls = dummyNodes + urls;

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
