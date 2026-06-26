import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { url, username, password } = await request.json();

    if (!url || !username || !password) {
      return new NextResponse("Missing WebDAV credentials", { status: 400 });
    }

    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    
    // Ensure URL has a trailing slash for directory PROPFIND
    const targetUrl = url.endsWith('/') ? url : `${url}/`;

    const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
      <D:propfind xmlns:D="DAV:">
        <D:prop>
          <D:displayname/>
          <D:getlastmodified/>
          <D:getcontentlength/>
          <D:resourcetype/>
        </D:prop>
      </D:propfind>`;

    const response = await fetch(targetUrl, {
      method: "PROPFIND",
      headers: {
        "Authorization": authHeader,
        "Depth": "1",
        "Content-Type": "text/xml; charset=utf-8"
      },
      body: propfindBody
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ files: [] }); // Folder might not exist yet
      }
      throw new Error(`WebDAV responded with ${response.status}: ${await response.text()}`);
    }

    const xmlText = await response.text();
    
    // Simple regex parsing for XML response to avoid huge dependencies
    const files = [];
    const responseBlocks = xmlText.split(/<[a-zA-Z0-9:]*response>/i);
    
    for (let i = 1; i < responseBlocks.length; i++) {
      const block = responseBlocks[i];
      
      // Extract href
      const hrefMatch = block.match(/<[a-zA-Z0-9:]*href>(.*?)<\/[a-zA-Z0-9:]*href>/i);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];
      
      // Ignore the parent folder itself
      if (href.endsWith('/')) continue;
      
      // Only list our JSON backups (or zip, depending on what we upload)
      if (!href.includes('.json') && !href.includes('.zip')) continue;

      // Extract filename from href
      const nameMatch = href.match(/([^\/]+)$/);
      const name = nameMatch ? decodeURIComponent(nameMatch[1]) : href;

      // Extract size
      const sizeMatch = block.match(/<[a-zA-Z0-9:]*getcontentlength>(.*?)<\/[a-zA-Z0-9:]*getcontentlength>/i);
      const sizeBytes = sizeMatch ? parseInt(sizeMatch[1]) : 0;
      
      // Extract date
      const dateMatch = block.match(/<[a-zA-Z0-9:]*getlastmodified>(.*?)<\/[a-zA-Z0-9:]*getlastmodified>/i);
      const dateStr = dateMatch ? dateMatch[1] : new Date().toUTCString();

      files.push({
        name,
        href,
        size: sizeBytes,
        lastModified: new Date(dateStr).toISOString()
      });
    }
    
    // Sort by newest first
    files.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return NextResponse.json({ files });
  } catch (err: any) {
    console.error("Failed to list WebDAV files:", err);
    return new NextResponse(err.message, { status: 500 });
  }
}
