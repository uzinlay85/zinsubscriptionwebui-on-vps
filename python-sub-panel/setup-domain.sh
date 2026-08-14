#!/bin/bash
set -e

echo "=========================================="
echo "  Domain & SSL Setup Script"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}.env file not found. Please run setup.sh first.${NC}"
    exit 1
fi

# Load .env
source .env

# Ask for domain
read -p "Enter your domain (e.g., vpn.example.com): " DOMAIN

if [ -z "$DOMAIN" ]; then
    echo -e "${RED}Domain cannot be empty${NC}"
    exit 1
fi

echo ""
echo "Configuring Nginx for domain: $DOMAIN"

# Create Nginx config
cat > /etc/nginx/sites-available/vpn-panel << 'EOF'
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER;

    # For Certbot challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;

    # SSL certificates (will be obtained via Certbot)
    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Logging
    access_log /var/log/nginx/vpn-panel.access.log;
    error_log /var/log/nginx/vpn-panel.error.log;

    # Proxy settings
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
        proxy_buffering off;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        access_log off;
    }
}
EOF

# Replace domain placeholder
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/vpn-panel

# Enable site
ln -sf /etc/nginx/sites-available/vpn-panel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t
systemctl reload nginx

echo -e "${GREEN}[✓]${NC} Nginx configured for $DOMAIN"

# Install Certbot if not present
echo ""
echo "Installing Certbot..."
apt update
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
echo ""
echo "Obtaining SSL certificate for $DOMAIN..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@$DOMAIN

echo -e "${GREEN}[✓]${NC} SSL certificate obtained"

# Update ADMIN_SECRET_PATH in .env if not set
if [ -z "$ADMIN_SECRET_PATH" ]; then
    ADMIN_SECRET_PATH=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 12 | head -n 1 | tr '[:upper:]' '[:lower:]')
    sed -i "s/ADMIN_SECRET_PATH=.*/ADMIN_SECRET_PATH=$ADMIN_SECRET_PATH/" .env
    echo -e "${GREEN}[✓]${NC} Generated ADMIN_SECRET_PATH: $ADMIN_SECRET_PATH"
fi

# Restart application
echo ""
echo "Restarting application..."

if command -v docker &> /dev/null && [ -f "../docker-compose.yml" ]; then
    cd ..
    docker compose up -d --build
    echo -e "${GREEN}[✓]${NC} Application restarted with Docker"
else
    if [ -f panel.pid ]; then
        kill $(cat panel.pid) 2>/dev/null || true
    fi
    source venv/bin/activate
    nohup uvicorn app.main:app --host 127.0.0.1 --port 8000 > panel.log 2>&1 &
    echo $! > panel.pid
    echo -e "${GREEN}[✓]${NC} Application restarted with uvicorn (PID: $(cat panel.pid))"
fi

# Final summary
echo ""
echo "=========================================="
echo "  Domain Setup Complete!"
echo "=========================================="
echo ""
echo "Your panel is now available at:"
echo -e "  ${GREEN}https://$DOMAIN/$ADMIN_SECRET_PATH${NC}"
echo ""
echo "Admin credentials:"
echo "  Username: $ADMIN_USERNAME"
echo "  Password: $ADMIN_PASSWORD"
echo ""
echo "SSL certificate will auto-renew."
echo "To check renewal status: certbot certificates"
echo ""
