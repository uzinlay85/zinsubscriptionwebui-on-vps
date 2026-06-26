import { NextResponse } from "next/server";

export async function DELETE(request: Request) {
  try {
    const { url, username, password, href } = await request.json();

    if (!url || !username || !password || !href) {
      return new NextResponse("Missing required parameters", { status: 400 });
    }

    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    
    // Construct the full URL of the file to delete.
    // Ensure we don't duplicate the host if href is absolute path and url contains host.
    const urlObj = new URL(url);
    const targetUrl = `${urlObj.protocol}//${urlObj.host}${href}`;

    const response = await fetch(targetUrl, {
      method: "DELETE",
      headers: {
        "Authorization": authHeader
      }
    });

    if (!response.ok) {
      throw new Error(`WebDAV responded with ${response.status}: ${await response.text()}`);
    }

    return NextResponse.json({ success: true, message: "File deleted successfully" });
  } catch (err: any) {
    console.error("Failed to delete WebDAV file:", err);
    return new NextResponse(err.message, { status: 500 });
  }
}
