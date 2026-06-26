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

  const client = data as { id: string; name: string; status: string } | null;

  if (clientError || !client) {
    return new NextResponse("Invalid subscription token", { status: 401 });
  }

  if (client.status !== "active") {
    return new NextResponse("Subscription is inactive", { status: 403 });
  }

  // Fetch all access keys for this client, joined with server name
  const { data: keysData, error: keysError } = await supabase
    .from("client_keys")
    .select("*, servers(name)")
    .eq("client_id", client.id);

  const clientKeys = keysData as {
    access_url: string;
    servers: { name: string } | null;
  }[] | null;

  if (keysError || !clientKeys) {
    return new NextResponse("Error fetching keys", { status: 500 });
  }

  // Build URL list
  const urls = clientKeys.map((k) => {
    const serverName = k.servers?.name ?? "Server";
    const keyLabel = `${serverName} - ${client.name}`;
    const baseUrl = k.access_url.split("#")[0];
    return `${baseUrl}#${encodeURIComponent(keyLabel)}`;
  }).join("\n");

  // Base64 encode the string (standard for V2Ray / Shadowsocks subscriptions)
  const base64Urls = Buffer.from(urls).toString("base64");

  return new NextResponse(base64Urls, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
