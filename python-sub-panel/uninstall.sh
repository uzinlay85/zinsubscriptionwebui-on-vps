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

# Detect installation directory
detect_install_dir() {
    # If running from within the repo
    if [ -f "docker-compose.yml" ] && [ -d "app" ]; then
        INSTALL_DIR=$(pwd)
        return
    fi
    
    if [ -f "python-sub-panel/docker-compose.yml" ] && [ -d "python-sub-panel/app" ]; then
        INSTALL_DIR=$(pwd)/python-sub-panel
        return
    fi
    
    # Check common locations
    if [ -d "/opt/vpn-sub-panel" ]; then
        INSTALL_DIR="/opt/vpn-sub-panel"
        return
    fi
    
    if [ -d "/home/zinko/zinsubscriptionwebui-on-vps/python-sub-panel" ]; then
        INSTALL_DIR="/home/zinko/zinsubscriptionwebui-on-vps/python-sub-panel"
        return
    fi
    
    # Ask user if not found
    echo -e "${YELLOW}Could not detect installation directory.${NC}"
    read -p "Enter the full path to your installation directory (e.g., /opt/vpn-sub-panel): " INSTALL_DIR
    
    if [ ! -d "$INSTALL_DIR" ]; then
        echo -e "${RED}Directory not found: $INSTALL_DIR${NC}"
        exit 1
    fi
}

detect_install_dir

echo -e "${GREEN}[✓]${NC} Detected installation directory: $INSTALL_DIR"

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
echo ""
echo -e "${YELLOW}[1/5] Stopping Docker containers...${NC}"
if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
    cd "$INSTALL_DIR"
    if command -v docker &> /dev/null && docker compose version &> /dev/null; then
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
if [ -f "$INSTALL_DIR/panel.pid" ]; then
    PID=$(cat "$INSTALL_DIR/panel.pid")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}[✓]${NC} uvicorn process (PID: $PID) stopped"
    else
        echo -e "${YELLOW}[!]${NC} Process $PID not running"
    fi
    rm -f "$INSTALL_DIR/panel.pid"
elif [ -f "$INSTALL_DIR/python-sub-panel/panel.pid" ]; then
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

# Step 4: Remove Nginx config and restore VLESS config if needed
echo ""
echo -e "${YELLOW}[4/5] Cleaning up Web & Nginx configuration...${NC}"

# Check for VLESS backup config
if [ -f "/etc/nginx/sites-available/vless.bak" ]; then
    echo -e "${GREEN}[!]${NC} Detected original VLESS backup config: /etc/nginx/sites-available/vless.bak"
    if ask_yes_no "Do you want to restore original VLESS Nginx configuration?"; then
        cp "/etc/nginx/sites-available/vless.bak" "/etc/nginx/sites-available/vless"
        rm -f "/etc/nginx/sites-available/vless.bak"
        echo -e "${GREEN}[✓]${NC} Original VLESS Nginx configuration restored"
    fi
fi

if [ -f /etc/nginx/sites-available/vpn-panel ]; then
    rm -f /etc/nginx/sites-available/vpn-panel
    echo -e "${GREEN}[✓]${NC} Nginx config removed"
fi

if [ -L /etc/nginx/sites-enabled/vpn-panel ]; then
    rm -f /etc/nginx/sites-enabled/vpn-panel
    echo -e "${GREEN}[✓]${NC} Nginx symlink removed"
fi

# Ask about SSL certificates (only for dedicated panel domain)
if [ -d /etc/letsencrypt/live ] && [ ! -f "/etc/nginx/sites-available/vless" ]; then
    echo ""
    if ask_yes_no "Do you want to remove SSL certificates from Let's Encrypt?"; then
        for cert_dir in /etc/letsencrypt/live/*; do
            cert_name=$(basename "$cert_dir")
            if grep -r "vpn-panel" /etc/nginx/sites-available/ 2>/dev/null | grep -q "$cert_name"; then
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

# Offer database backup before removing
DB_PATH=""
if [ -f "$INSTALL_DIR/data/vpn_panel.db" ]; then
    DB_PATH="$INSTALL_DIR/data/vpn_panel.db"
elif [ -f "$INSTALL_DIR/python-sub-panel/data/vpn_panel.db" ]; then
    DB_PATH="$INSTALL_DIR/python-sub-panel/data/vpn_panel.db"
fi

if [ -n "$DB_PATH" ]; then
    if ask_yes_no "Do you want to backup the SQLite database before deleting?"; then
        BACKUP_DEST="/root/vpn_panel_backup_$(date +%Y%m%d_%H%M%S).db"
        cp "$DB_PATH" "$BACKUP_DEST"
        echo -e "${GREEN}[✓]${NC} Database saved safely to: $BACKUP_DEST"
    fi
fi

if [ -d "$INSTALL_DIR" ]; then
    if ask_yes_no "Do you want to completely remove $INSTALL_DIR? This will delete panel files only."; then
        rm -rf "$INSTALL_DIR"
        echo -e "${GREEN}[✓]${NC} Installation directory removed"
    else
        echo "Keeping installation directory at $INSTALL_DIR"
        echo "You can manually remove it later with: rm -rf $INSTALL_DIR"
    fi
else
    echo -e "${YELLOW}[!]${NC} Installation directory not found"
fi

# Note: Docker is intentionally preserved so Outline and other VPN containers remain active!
echo -e "${GREEN}[✓]${NC} Other VPN services (Outline, Hysteria2, 3x-ui / VLESS) and Docker are preserved safely."

# Final summary
echo ""
echo "=========================================="
echo "  Uninstall Complete!"
echo "=========================================="
echo ""
echo "The VPN Subscription Panel has been removed cleanly."
echo "Your VPN servers (Outline, Hysteria2, VLESS) remain 100% active and untouched."
echo ""
echo "If you kept the installation directory, you can manually remove it with:"
echo "  rm -rf $INSTALL_DIR"
echo ""
echo "To reinstall in the future, run:"
echo "  curl -fsSL https://raw.githubusercontent.com/uzinlay85/zinsubscriptionwebui-on-vps/main/python-sub-panel/setup.sh -o setup.sh"
echo "  bash setup.sh"
echo ""
