#!/bin/bash
set -e

echo "=========================================="
echo "  VPN Subscription Panel - One Click Setup"
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

# Check OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}Cannot detect OS. This script supports Ubuntu/Debian only.${NC}"
    exit 1
fi

if [ "$OS" != "ubuntu" ] && [ "$OS" != "debian" ]; then
    echo -e "${RED}This script supports Ubuntu/Debian only. Detected: $OS${NC}"
    exit 1
fi

echo -e "${GREEN}[✓]${NC} OS detected: $OS"

# Function to generate random string
generate_secret() {
    cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1
}

# Function to ask yes/no
ask_yes_no() {
    while true; do
        read -p "$1 (y/n): " yn
        case $yn in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Please answer y or n.";;
        esac
    done
}

# Step 1: Install Docker if not present
echo ""
echo -e "${YELLOW}[1/6] Checking Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable --now docker
    echo -e "${GREEN}[✓]${NC} Docker installed successfully"
else
    echo -e "${GREEN}[✓]${NC} Docker already installed ($(docker --version))"
fi

if ! command -v docker compose &> /dev/null; then
    echo "Docker Compose plugin not found. Installing..."
    apt update
    apt install -y docker-compose-plugin
    echo -e "${GREEN}[✓]${NC} Docker Compose installed"
else
    echo -e "${GREEN}[✓]${NC} Docker Compose already installed ($(docker compose version --short))"
fi

# Step 2: Clone or update repository
echo ""
echo -e "${YELLOW}[2/6] Setting up project directory...${NC}"
INSTALL_DIR="/opt/vpn-sub-panel"

if [ -d "$INSTALL_DIR" ]; then
    echo "Directory $INSTALL_DIR already exists."
    if ask_yes_no "Do you want to update the existing installation?"; then
        cd "$INSTALL_DIR"
        git pull origin main
        echo -e "${GREEN}[✓]${NC} Repository updated"
    else
        echo "Using existing directory."
    fi
else
    echo "Cloning repository..."
    git clone https://github.com/uzinlay85/zinsubscriptionwebui-on-vps.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    echo -e "${GREEN}[✓]${NC} Repository cloned"
fi

cd "$INSTALL_DIR/python-sub-panel"

# Step 3: Create .env file
echo ""
echo -e "${YELLOW}[3/6] Configuring environment...${NC}"

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
    else
        touch .env
    fi
    
    # Generate secure credentials
    ADMIN_USERNAME="admin"
    ADMIN_PASSWORD=$(generate_secret)
    AUTH_SECRET=$(generate_secret)
    CRON_SECRET=$(generate_secret)
    ADMIN_SECRET_PATH=$(generate_secret | tr -d '[:upper:]' | head -c 12)
    
    # Ask for admin username
    read -p "Admin username [default: admin]: " input_username
    ADMIN_USERNAME=${input_username:-admin}
    
    # Ask for admin password
    read -p "Admin password [default: generated]: " input_password
    ADMIN_PASSWORD=${input_password:-$ADMIN_PASSWORD}
    
    # Ask for app name
    read -p "App/Brand name [default: My VPN Panel]: " input_app_name
    APP_NAME=${input_app_name:-"My VPN Panel"}
    
    # Ask for sync interval
    read -p "Usage sync interval in minutes [default: 10]: " input_sync
    SYNC_INTERVAL=${input_sync:-10}
    
    # Write .env file
    cat > .env << EOF
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
AUTH_SECRET=$AUTH_SECRET
CRON_SECRET=$CRON_SECRET
ADMIN_SECRET_PATH=$ADMIN_SECRET_PATH
APP_NAME=$APP_NAME
PANEL_NAME=VPN Panel
SYNC_INTERVAL_MINUTES=$SYNC_INTERVAL
DATABASE_URL=sqlite:///./data/panel.db
EOF

    echo ""
    echo -e "${GREEN}[✓]${NC} Configuration saved to .env"
    echo ""
    echo "Your credentials:"
    IP_ADDRESS=$(curl -s -4 ifconfig.me 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null || curl -s -4 ipinfo.io/ip 2>/dev/null || hostname -I | awk '{print $1}')
    echo "  Admin URL: http://$IP_ADDRESS:8000/$ADMIN_SECRET_PATH"
    echo "  Username: $ADMIN_USERNAME"
    echo "  Password: $ADMIN_PASSWORD"
    echo ""
    echo -e "${YELLOW}⚠️  Please save these credentials somewhere safe!${NC}"
else
    echo -e "${GREEN}[✓]${NC} .env file already exists, skipping configuration"
fi

# Load .env variables for display
if [ -f .env ]; then
    while IFS= read -r line; do
        line=$(echo "$line" | sed 's/#.*//' | xargs)
        if [ -n "$line" ]; then
            var_name=$(echo "$line" | cut -d'=' -f1)
            var_value=$(echo "$line" | cut -d'=' -f2-)
            if [ -n "$var_name" ]; then
                eval "$var_name=\"$var_value\""
            fi
        fi
    done < .env
fi

# Step 4: Create data directory
echo ""
echo -e "${YELLOW}[4/6] Creating data directory...${NC}"
mkdir -p data
chmod 755 data
echo -e "${GREEN}[✓]${NC} Data directory ready"

# Step 5: Start application
echo ""
echo -e "${YELLOW}[5/6] Starting application...${NC}"

if command -v docker &> /dev/null && command -v docker compose &> /dev/null; then
    echo "Starting with Docker Compose..."
    docker compose up -d --build
    
    # Wait for container to start
    sleep 3
    
    # Check if container is running
    if docker compose ps | grep -q "Up"; then
        echo -e "${GREEN}[✓]${NC} Application started with Docker"
        
        # Show logs
        echo ""
        echo "Recent logs:"
        docker compose logs --tail=20
    else
        echo -e "${RED}[✗]${NC} Failed to start with Docker"
        echo "Check logs with: docker compose logs"
    fi
else
    echo "Docker not available. Starting with uvicorn..."
    
    # Install Python dependencies
    if [ ! -d "venv" ]; then
        apt update
        apt install -y python3-venv python3-pip
        python3 -m venv venv
    fi
    
    source venv/bin/activate
    pip install -q -r requirements.txt
    
    # Start uvicorn in background
    nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > panel.log 2>&1 &
    echo $! > panel.pid
    
    sleep 2
    
    if curl -s http://localhost:8000/health > /dev/null; then
        echo -e "${GREEN}[✓]${NC} Application started with uvicorn (PID: $(cat panel.pid))"
    else
        echo -e "${RED}[✗]${NC} Failed to start application"
        echo "Check logs: tail -f panel.log"
    fi
fi

# Step 6: Firewall configuration
echo ""
echo -e "${YELLOW}[6/7] Configuring firewall...${NC}"

if command -v ufw &> /dev/null; then
    if ! ufw status | grep -q "Status: active"; then
        echo "Enabling UFW..."
        ufw --force enable
    fi
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 8000/tcp
    echo -e "${GREEN}[✓]${NC} Firewall rules added"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --permanent --add-port=8000/tcp
    firewall-cmd --reload
    echo -e "${GREEN}[✓]${NC} Firewall rules added"
else
    echo -e "${YELLOW}[!]${NC} No firewall detected. Please manually open ports 80, 443, and 8000"
fi

# Step 7: Optional domain setup
echo ""
echo -e "${YELLOW}[7/7] Domain setup (optional)${NC}"

ask_domain_setup() {
    while true; do
        read -p "Do you want to setup a domain with HTTPS? (y/n): " yn
        case $yn in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Please answer y or n.";;
        esac
    done
}

if ask_domain_setup; then
    # Ask for domain
    read -p "Enter your domain (e.g., vpn.example.com): " DOMAIN
    
    if [ -z "$DOMAIN" ]; then
        echo -e "${YELLOW}[!]${NC} No domain provided, skipping domain setup"
    else
        echo ""
        echo "Configuring Nginx for domain: $DOMAIN"
        
        # Install Nginx if not present
        if ! command -v nginx &> /dev/null; then
            echo "Installing Nginx..."
            apt update
            apt install -y nginx
        fi
        
        # Create initial HTTP-only Nginx config
        cat > /etc/nginx/sites-available/vpn-panel << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
        proxy_buffering off;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        access_log off;
    }
}
EOF
        
        # Enable site
        ln -sf /etc/nginx/sites-available/vpn-panel /etc/nginx/sites-enabled/
        rm -f /etc/nginx/sites-enabled/default
        
        # Test and reload Nginx
        nginx -t && systemctl reload nginx
        
        echo -e "${GREEN}[✓]${NC} Nginx configured for $DOMAIN"
        
        # Install Certbot if not present
        echo ""
        echo "Installing Certbot..."
        apt update
        apt install -y certbot python3-certbot-nginx
        
        # Get SSL certificate
        echo ""
        echo "Obtaining SSL certificate for $DOMAIN..."
        
        # Use certbot with nginx plugin - it will auto-configure HTTPS
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@$DOMAIN
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}[✓]${NC} SSL certificate obtained and Nginx configured for HTTPS"
        else
            echo -e "${YELLOW}[!]${NC} SSL certificate could not be obtained. HTTP only mode."
        fi
        
        # Restart application
        echo ""
        echo "Restarting application..."
        
        if command -v docker &> /dev/null && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
            cd "$INSTALL_DIR"
            docker compose up -d --build
            echo -e "${GREEN}[✓]${NC} Application restarted with Docker"
        elif command -v docker &> /dev/null && [ -f "$INSTALL_DIR/python-sub-panel/docker-compose.yml" ]; then
            cd "$INSTALL_DIR/python-sub-panel"
            docker compose up -d --build
            echo -e "${GREEN}[✓]${NC} Application restarted with Docker"
        else
            if [ -f "$INSTALL_DIR/panel.pid" ]; then
                kill $(cat "$INSTALL_DIR/panel.pid") 2>/dev/null || true
            fi
            cd "$INSTALL_DIR"
            if [ -f "venv/bin/activate" ]; then
                source venv/bin/activate
            fi
            nohup uvicorn app.main:app --host 127.0.0.1 --port 8000 > panel.log 2>&1 &
            echo $! > panel.pid
            echo -e "${GREEN}[✓]${NC} Application restarted with uvicorn (PID: $(cat panel.pid))"
        fi
        
        # Final summary for domain setup
        echo ""
        echo "=========================================="
        echo "  Setup Complete!"
        echo "=========================================="
        echo ""
        
        # Load .env to display credentials
        if [ -f "$INSTALL_DIR/python-sub-panel/.env" ]; then
            while IFS= read -r line; do
                line=$(echo "$line" | sed 's/#.*//' | xargs)
                if [ -n "$line" ]; then
                    var_name=$(echo "$line" | cut -d'=' -f1)
                    var_value=$(echo "$line" | cut -d'=' -f2-)
                    if [ -n "$var_name" ]; then
                        eval "$var_name=\"$var_value\""
                    fi
                fi
            done < "$INSTALL_DIR/python-sub-panel/.env"
        fi
        
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
        exit 0
    fi
fi

# Final summary
echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Access your panel at:"
IP_ADDRESS=$(curl -s -4 ifconfig.me 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null || curl -s -4 ipinfo.io/ip 2>/dev/null || hostname -I | awk '{print $1}')
echo -e "  ${GREEN}http://$IP_ADDRESS:8000/$ADMIN_SECRET_PATH${NC}"
echo ""
echo "To view logs:"
if command -v docker &> /dev/null && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
    echo "  cd $INSTALL_DIR && docker compose logs -f"
elif command -v docker &> /dev/null && [ -f "$INSTALL_DIR/python-sub-panel/docker-compose.yml" ]; then
    echo "  cd $INSTALL_DIR/python-sub-panel && docker compose logs -f"
else
    echo "  tail -f $INSTALL_DIR/python-sub-panel/panel.log"
fi
echo ""
echo "To stop the application:"
if command -v docker &> /dev/null && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
    echo "  cd $INSTALL_DIR && docker compose down"
elif command -v docker &> /dev/null && [ -f "$INSTALL_DIR/python-sub-panel/docker-compose.yml" ]; then
    echo "  cd $INSTALL_DIR/python-sub-panel && docker compose down"
else
    echo "  kill \$(cat $INSTALL_DIR/python-sub-panel/panel.pid)"
fi
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Access the panel using the URL above"
echo "2. Login with your admin credentials"
echo "3. Add your VPN servers"
echo "4. Create clients and generate subscription links"
echo ""
echo -e "${YELLOW}Optional: Setup domain with SSL later${NC}"
echo "Run: bash setup-domain.sh"
echo ""

# Health check verification
echo -e "${YELLOW}Running health check...${NC}"
sleep 2
if curl -s http://localhost:8000/health > /dev/null; then
    echo -e "${GREEN}[✓]${NC} Application is healthy and responding"
else
    echo -e "${YELLOW}[!]${NC} Application may still be starting..."
    echo "  Run: docker compose logs -f"
fi
echo ""
