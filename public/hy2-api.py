#!/usr/bin/env python3
import http.server
import json
import os
import re
import sys

# Configuration
CONFIG_FILE = "/etc/hysteria/config.yaml"
PORT = 3000

# Read credentials from script arguments or prompt
if len(sys.argv) < 3:
    print("Usage: python3 hy2-api.py <ADMIN_USERNAME> <ADMIN_PASSWORD> [PORT]")
    print("Example: python3 hy2-api.py admin SecretPass123 3000")
    sys.exit(1)

ADMIN_USER = sys.argv[1]
ADMIN_PASS = sys.argv[2]
if len(sys.argv) >= 4:
    try:
        PORT = int(sys.argv[3])
    except ValueError:
        pass

# Simple token for API auth (in production, use a more secure random string)
AUTH_TOKEN = f"token_{ADMIN_USER}_{ADMIN_PASS}"

def read_users():
    users = []
    if not os.path.exists(CONFIG_FILE):
        return users
    
    in_userpass = False
    with open(CONFIG_FILE, 'r') as f:
        for line in f:
            stripped = line.strip()
            if stripped == 'userpass:':
                in_userpass = True
                continue
            if in_userpass:
                if not stripped:
                    continue
                # If line is not indented, we exited userpass section
                if not line.startswith(' ') and not line.startswith('\t'):
                    in_userpass = False
                    continue
                # Match username: "password"
                match = re.match(r'^\s*([a-zA-Z0-9_-]+)\s*:\s*"?([^"\s]+)"?', line)
                if match:
                    username = match.group(1)
                    password = match.group(2)
                    users.append({"username": username, "password": password})
                else:
                    if ':' in stripped and not line.startswith('  '):
                        in_userpass = False
    
    # Assign index-based IDs
    for idx, user in enumerate(users):
        user["id"] = idx + 1
    return users

def add_user_to_config(username, password):
    if not os.path.exists(CONFIG_FILE):
        return False
    
    lines = []
    added = False
    with open(CONFIG_FILE, 'r') as f:
        for line in f:
            lines.append(line)
            if line.strip() == 'userpass:':
                lines.append(f'    {username}: "{password}"\n')
                added = True
    
    if added:
        with open(CONFIG_FILE, 'w') as f:
            f.writelines(lines)
        os.system("systemctl restart hysteria-server.service")
    return added

def delete_user_from_config(username):
    if not os.path.exists(CONFIG_FILE):
        return False
    
    lines = []
    in_userpass = False
    deleted = False
    with open(CONFIG_FILE, 'r') as f:
        for line in f:
            stripped = line.strip()
            if stripped == 'userpass:':
                in_userpass = True
                lines.append(line)
                continue
            if in_userpass:
                if not line.startswith(' ') and not line.startswith('\t'):
                    in_userpass = False
                else:
                    match = re.match(r'^\s*([a-zA-Z0-9_-]+)\s*:', line)
                    if match and match.group(1) == username:
                        deleted = True
                        continue
            lines.append(line)
            
    if deleted:
        with open(CONFIG_FILE, 'w') as f:
            f.writelines(lines)
        os.system("systemctl restart hysteria-server.service")
    return deleted

class HysteriaAPIHandler(http.server.BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def is_authorized(self):
        auth_header = self.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return False
        token = auth_header.split(' ')[1]
        return token == AUTH_TOKEN

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        try:
            body = json.loads(post_data) if post_data else {}
        except json.JSONDecodeError:
            body = {}

        if self.path == '/api/login':
            user = body.get('username')
            pwd = body.get('password')
            if user == ADMIN_USER and pwd == ADMIN_PASS:
                self._send_json({"ok": True, "token": AUTH_TOKEN})
            else:
                self._send_json({"ok": False, "error": "Invalid credentials"}, 401)
            return

        if not self.is_authorized():
            self._send_json({"error": "Unauthorized"}, 401)
            return

        if self.path == '/api/users':
            username = body.get('username')
            password = body.get('password')
            if not username or not password:
                self._send_json({"error": "Username and password required"}, 400)
                return
            
            # Check if user already exists
            existing_users = read_users()
            if any(u["username"] == username for u in existing_users):
                self._send_json({"error": "User already exists"}, 400)
                return

            if add_user_to_config(username, password):
                # Return the new list length as ID
                new_users = read_users()
                user_id = next((u["id"] for u in new_users if u["username"] == username), 999)
                self._send_json({"ok": True, "id": user_id})
            else:
                self._send_json({"error": "Failed to write config"}, 500)
            return

        self._send_json({"error": "Not Found"}, 404)

    def do_GET(self):
        if not self.is_authorized():
            self._send_json({"error": "Unauthorized"}, 401)
            return

        if self.path == '/api/users':
            users = read_users()
            self._send_json(users)
            return

        self._send_json({"error": "Not Found"}, 404)

    def do_PUT(self):
        if not self.is_authorized():
            self._send_json({"error": "Unauthorized"}, 401)
            return

        match = re.match(r'^/api/users/(\d+)$', self.path)
        if match:
            user_id = int(match.group(1))
            content_length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(content_length).decode('utf-8'))
            
            username = body.get('username')
            password = body.get('password')
            
            users = read_users()
            target_user = next((u for u in users if u["id"] == user_id), None)
            if not target_user:
                self._send_json({"error": "User not found"}, 404)
                return

            # If password or username changed, update config
            delete_user_from_config(target_user["username"])
            add_user_to_config(username, password)
            self._send_json({"ok": True})
            return

        self._send_json({"error": "Not Found"}, 404)

    def do_DELETE(self):
        if not self.is_authorized():
            self._send_json({"error": "Unauthorized"}, 401)
            return

        match = re.match(r'^/api/users/(\d+)$', self.path)
        if match:
            user_id = int(match.group(1))
            users = read_users()
            target_user = next((u for u in users if u["id"] == user_id), None)
            if not target_user:
                self._send_json({"error": "User not found"}, 404)
                return

            if delete_user_from_config(target_user["username"]):
                self._send_json({"ok": True})
            else:
                self._send_json({"error": "Failed to delete user"}, 500)
            return

        self._send_json({"error": "Not Found"}, 404)

if __name__ == '__main__':
    print(f"Starting Standalone Hysteria2 API on port {PORT}...")
    server = http.server.HTTPServer(('0.0.0.0', PORT), HysteriaAPIHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    print("Stopping server.")
