"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import https from "https";

export async function assignServerToClient(formData: FormData) {
  const clientId = formData.get("clientId") as string;
  const serverId = formData.get("serverId") as string;

  if (!clientId || !serverId) {
    return { error: "Client and Server are required" };
  }

  // Fetch the server's API details from Supabase
  const { data: server, error: serverError } = await supabase
    .from("servers")
    .select("*")
    .eq("id", serverId)
    .single();

  if (serverError || !server) {
    return { error: "Server not found" };
  }

  // Fetch client name
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return { error: "Client not found" };
  }

  const serverData = server as { name: string; api_url: string; cert_sha256: string };
  const clientData = client as { name: string };

  // Key name = "ServerName - ClientName"
  const keyName = `${serverData.name} - ${clientData.name}`;

  try {
    // Create a new access key via Outline Management API with a name
    const outlineKey = await new Promise<{ id: string; accessUrl: string }>(
      (resolve, reject) => {
        const url = new URL(`${serverData.api_url}/access-keys`);
        const body = JSON.stringify({ name: keyName });

        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          // Bypass self-signed certificate verification
          rejectUnauthorized: false,
        };

        const req = https.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve({ id: String(json.id), accessUrl: json.accessUrl });
              } else {
                reject(new Error(`Outline API error: ${data}`));
              }
            } catch {
              reject(new Error("Failed to parse Outline API response"));
            }
          });
        });

        req.on("error", (e) => reject(e));
        req.write(body);
        req.end();
      }
    );

    // Save the generated key to Supabase
    const { error: insertError } = await supabase.from("client_keys").insert({
      client_id: clientId,
      server_id: serverId,
      outline_key_id: outlineKey.id,
      access_url: outlineKey.accessUrl,
    });

    if (insertError) {
      return { error: insertError.message };
    }

    revalidatePath(`/clients/${clientId}`);
    return { success: true };

  } catch (err: any) {
    return { error: err.message || "Failed to connect to Outline server" };
  }
}

export async function removeClientKey(id: string, clientId: string) {
  const { error } = await supabase.from("client_keys").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}
