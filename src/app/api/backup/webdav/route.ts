import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { url, username, password, backupData } = await request.json();

    if (!url || !username || !password || !backupData) {
      return new NextResponse("Missing WebDAV credentials or backup data", { status: 400 });
    }

    // Format the date for the filename
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `outline_panel_backup_${dateStr}.json`;
    
    // Make sure the URL ends with a slash if it's a directory
    const uploadUrl = url.endsWith('/') ? `${url}${fileName}` : `${url}/${fileName}`;

    // Create Basic Auth header
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(backupData, null, 2),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WebDAV server responded with ${response.status}: ${errorText}`);
    }

    return NextResponse.json({ success: true, message: `Backup uploaded successfully to ${uploadUrl}` });

  } catch (error: any) {
    console.error("WebDAV backup failed:", error);
    return new NextResponse(error.message || "Failed to upload to WebDAV", { status: 500 });
  }
}
