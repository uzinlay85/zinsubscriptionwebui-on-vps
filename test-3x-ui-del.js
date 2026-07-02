const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: servers } = await supabase.from('servers').select('*').eq('type', '3x-ui');
  if (!servers || servers.length === 0) return console.log('No 3x-ui servers');
  
  const server = servers[0];
  console.log('Testing server:', server.name, server.api_url);

  // Login
  const loginData = { username: server.username || server.auth_username, password: server.password || server.auth_password };
  const cleanUrl = server.api_url.replace(/\/$/, "");
  const loginRes = await fetch(`${cleanUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginData)
  });
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  console.log('Logged in. Cookie:', cookie ? 'yes' : 'no');

  // Get CSRF
  const csrfRes = await fetch(`${cleanUrl}/`, { headers: { "Cookie": cookie } });
  const html = await csrfRes.text();
  const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/i);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";
  console.log('CSRF Token:', csrfToken);

  const inboundId = server.inbound_id;
  const getRes = await fetch(`${cleanUrl}/panel/api/inbounds/get/${inboundId}`, {
    headers: { "Cookie": cookie }
  });
  const inboundData = await getRes.json();
  const settings = JSON.parse(inboundData.obj.settings);
  const clients = settings.clients || [];
  console.log('Found', clients.length, 'clients on inbound');

  if (clients.length > 0) {
    const testClient = clients[clients.length - 1]; // last client
    console.log('Client details:', testClient);
    
    // Test delClient API
    const uuid = testClient.id || testClient.password;
    console.log(`Sending POST to ${cleanUrl}/panel/api/inbounds/${inboundId}/delClient/${uuid}`);
    const delRes = await fetch(`${cleanUrl}/panel/api/inbounds/${inboundId}/delClient/${uuid}`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...(csrfToken ? { "X-Csrf-Token": csrfToken } : {})
      }
    });

    const delText = await delRes.text();
    console.log('Delete status:', delRes.status);
    console.log('Delete response:', delText);
  } else {
    console.log('No clients to delete');
  }
}

run();
