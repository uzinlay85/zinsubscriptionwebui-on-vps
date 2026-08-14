#!/bin/bash
set -e

echo "=========================================="
echo "  VPN Subscription Panel - Uninstall"
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

INSTALL_DIR="/opt/vpn-sub-panel"

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

# Step 1: Stop and remove Docker containers
echo -e "${YELLOW}[1/5] Stopping Docker containers...${NC}"
if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
    cd "$INSTALL_DIR"
    if command -v docker &> /dev/null && command -v docker compose &> /dev/null; then
        docker compose down -v 2>/dev/null || true
        echo -e "${GREEN}[✓]${NC} Docker containers stopped and removed"
    else
        echo -e "${YELLOW}[!]${NC} Docker not found, skipping container removal"
    fi
else
    echo -e "${YELLOW}[!]${NC} No docker-compose.yml found, skipping Docker cleanup"
fi

# Step 2: Stop systemd service if running
echo ""
echo -e "${YELLOW}[2/5] Stopping systemd service...${NC}"
if systemctl is-active --quiet vpn-panel 2>/dev/null; then
    systemctl stop vpn-panel
    systemctl disable vpn-panel
    rm -f /etc/systemd/system/vpn-panel.service
    systemctl daemon-reload
    echo -e "${GREEN}[✓]${NC} systemd service stopped and removed"
else
    echo -e "${YELLOW}[!]${NC} No systemd service found"
fi

# Step 3: Stop uvicorn process if running
echo ""
echo -e "${YELLOW}[3/5] Stopping uvicorn process...${NC}"
if [ -f "$INSTALL_DIR/python-sub-panel/panel.pid" ]; then
    PID=$(cat "$INSTALL_DIR/python-sub-panel/panel.pid")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}[✓]${NC} uvicorn process (PID: $PID) stopped"
    else
        echo -e "${YELLOW}[!]${NC} Process $PID not running"
    fi
    rm -f "$INSTALL_DIR/python-sub-panel/panel.pid"
else
    echo -e "${YELLOW}[!]${NC} No PID file found"
fi

# Also kill any uvicorn processes on port 8000
if command -v lsof &> /dev/null; then
    if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "Killing remaining processes on port 8000..."
        kill $(lsof -t -i :8000) 2>/dev/null || true
        echo -e "${GREEN}[✓]${NC} Port 8000 cleared"
    fi
fi

# Step 4: Remove Nginx config and SSL certificates
echo ""
echo -e "${YELLOW}[4/5] Removing Nginx configuration...${NC}"
if [ -f /etc/nginx/sites-available/vpn-panel ]; then
    rm -f /etc/nginx/sites-available/vpn-panel
    echo -e "${GREEN}[✓]${NC} Nginx config removed"
fi

if [ -L /etc/nginx/sites-enabled/vpn-panel ]; then
    rm -f /etc/nginx/sites-enabled/vpn-panel
    echo -e "${GREEN}[✓]${NC} Nginx symlink removed"
fi

# Ask about SSL certificates
if [ -d /etc/letsencrypt/live ]; then
    echo ""
    if ask_yes_no "Do you want to remove SSL certificates from Let's Encrypt?"; then
        # Find and remove certificates related to the panel
        for cert_dir in /etc/letsencrypt/live/*; do
            cert_name=$(basename "$cert_dir")
            if grep -r "vpn-panel\|$INSTALL_DIR" /etc/nginx/sites-available/ 2>/dev/null | grep -q "$cert_name"; then
                echo "Removing certificate: $cert_name"
                certbot delete --cert-name "$cert_name" --non-interactive 2>/dev/null || true
            fi
        done
        echo -e "${GREEN}[✓]${NC} SSL certificates removed"
    fi
fi

# Reload Nginx if it's running
if systemctl is-active --quiet nginx 2>/dev/null; then
    nginx -t && systemctl reload nginx || true
    echo -e "${GREEN}[✓]${NC} Nginx reloaded"
fi

# Step 5: Remove installation directory
echo ""
echo -e "${YELLOW}[5/5] Removing installation files...${NC}"
if [ -d "$INSTALL_DIR" ]; then
    if ask_yes_no "Do you want to completely remove $INSTALL_DIR? This will delete all data including database and configuration."; then
        rm -rf "$INSTALL_DIR"
        echo -e "${GREEN}[✓]${NC} Installation directory removed"
    else
        echo "Keeping installation directory at $INSTALL_DIR"
        echo "You can manually remove it later with: rm -rf $INSTALL_DIR"
    fi
else
    echo -e "${YELLOW}[!]${NC} Installation directory not found"
fi

# Optional: Remove Docker
echo ""
if ask_yes_no "Do you want to remove Docker and Docker Compose? (Not recommended if you use Docker for other services)"; then
    if command -v docker &> /dev/null; then
        echo "Removing Docker..."
        apt remove -y docker.io docker-compose 2>/dev/null || true
        apt autoremove -y 2>/dev/null || true
        echo -e "${GREEN}[✓]${NC} Docker removed"
    else
        echo -e "${YELLOW}[!]${NC} Docker not found"
    fi
else
    echo "Keeping Docker installed"
fi

# Final summary
echo ""
echo "=========================================="
echo "  Uninstall Complete!"
echo "=========================================="
echo ""
echo "The VPN Subscription Panel has been removed from your system."
echo ""
echo "If you kept the installation directory, you can manually remove it with:"
echo "  rm -rf $INSTALL_DIR"
echo ""
echo "To reinstall in the future, run:"
echo "  curl -fsSL https://raw.githubusercontent.com/uzinlay85/zinsubscriptionwebui-on-vps/main/python-sub-panel/setup.sh -o setup.sh"
echo "  bash setup.sh"
echo ""
