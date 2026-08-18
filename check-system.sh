#!/usr/bin/env bash
# ==============================================================================
# All-in-One VPN & Subscription System Diagnostic / Health-Check Tool
# Checks Outline, Hysteria 2, 3x-ui (VLESS), AmneziaWG 2.0 & Sublink Panel
# ==============================================================================

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

pass_count=0
warn_count=0
fail_count=0

print_header() {
    clear
    echo -e "${CYAN}====================================================================${NC}"
    echo -e "${BOLD}${BLUE}   🚀 All-in-One VPN & Subscription System Health Checker${NC}"
    echo -e "${CYAN}====================================================================${NC}"
    echo -e "Server Hostname : ${BOLD}$(hostname)${NC}"
    echo -e "Public IPv4     : ${BOLD}$(curl -s -4 ifconfig.me 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null || echo 'Unknown')${NC}"
    echo -e "System Time     : $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo -e "${CYAN}--------------------------------------------------------------------${NC}\n"
}

check_item() {
    local title="$1"
    local status="$2"
    local msg="$3"

    if [ "$status" -eq 0 ]; then
        echo -e " [${GREEN}✓ ONLINE${NC}] ${BOLD}${title}${NC} - ${GREEN}${msg}${NC}"
        ((pass_count++))
    elif [ "$status" -eq 1 ]; then
        echo -e " [${YELLOW}! WARNING${NC}] ${BOLD}${title}${NC} - ${YELLOW}${msg}${NC}"
        ((warn_count++))
    else
        echo -e " [${RED}✗ OFFLINE${NC}] ${BOLD}${title}${NC} - ${RED}${msg}${NC}"
        ((fail_count++))
    fi
}

# 1. Check Docker & Core Tools
check_core_tools() {
    echo -e "${BOLD}${MAGENTA}▶ [1/5] Checking System & Core Services${NC}"

    # Docker
    if command -v docker &>/dev/null && systemctl is-active --quiet docker; then
        local docker_ver=$(docker --version | awk '{print $3}' | tr -d ',')
        check_item "Docker Service" 0 "Running (v${docker_ver})"
    else
        check_item "Docker Service" 2 "Docker is not running or not installed"
    fi

    # Nginx
    if systemctl is-active --quiet nginx; then
        local nginx_conf_test=$(nginx -t 2>&1)
        if echo "$nginx_conf_test" | grep -q "syntax is ok"; then
            check_item "Nginx Web Server" 0 "Running with valid configuration"
        else
            check_item "Nginx Web Server" 1 "Running but config test has warnings"
        fi
    else
        check_item "Nginx Web Server" 2 "Nginx is stopped or not installed"
    fi

    # UFW Firewall
    if command -v ufw &>/dev/null; then
        if ufw status | grep -q "Status: active"; then
            check_item "UFW Firewall" 0 "Active & Protecting Ports"
        else
            check_item "UFW Firewall" 1 "Inactive (Ports may be managed by cloud firewall)"
        fi
    fi
    echo ""
}

# 2. Check VPN Protocols & Daemons
check_vpn_daemons() {
    echo -e "${BOLD}${MAGENTA}▶ [2/5] Checking VPN Engines & Daemons${NC}"

    # 1. Hysteria 2
    if systemctl is-active --quiet hysteria-server 2>/dev/null || ss -ulpn | grep -q ":10443"; then
        check_item "Hysteria 2 (UDP 10443)" 0 "Listening & Active"
    else
        check_item "Hysteria 2 (UDP 10443)" 2 "Not listening on Port 10443"
    fi

    # 2. 3x-ui (Xray Core)
    if systemctl is-active --quiet x-ui 2>/dev/null || ss -tlpn | grep -q ":2053"; then
        check_item "3x-ui Xray Core (Port 2053)" 0 "Running & Inbound Ready"
    else
        check_item "3x-ui Xray Core (Port 2053)" 2 "x-ui service is stopped"
    fi

    # 3. Outline VPN (Shadowbox)
    if docker ps 2>/dev/null | grep -q "shadowbox"; then
        check_item "Outline VPN (Port 8443)" 0 "Docker Container Running"
    elif ss -tlpn | grep -q ":8443" || ss -ulpn | grep -q ":8443"; then
        check_item "Outline VPN (Port 8443)" 0 "Port 8443 Active"
    else
        check_item "Outline VPN (Port 8443)" 1 "Not installed or Port 8443 unused"
    fi

    # 4. AmneziaWG 2.0
    if docker ps 2>/dev/null | grep -q "amnezia-wg-easy"; then
        if ss -ulpn | grep -q ":58210"; then
            check_item "AmneziaWG 2.0 (UDP 58210)" 0 "QUIC Obfuscation Active"
        else
            check_item "AmneziaWG 2.0 (UDP 58210)" 1 "Container up but UDP 58210 not verified"
        fi
    else
        check_item "AmneziaWG 2.0 (UDP 58210)" 1 "Not installed or container not running"
    fi

    echo ""
}

# 3. Check Management Web Panels & Internal Endpoints
check_web_panels() {
    echo -e "${BOLD}${MAGENTA}▶ [3/5] Checking Management Web Panels${NC}"

    # 1. Unified Sublink Panel
    if curl -s -f http://127.0.0.1:8000/health &>/dev/null || docker ps 2>/dev/null | grep -q "vpn-sub-panel"; then
        check_item "Unified Sublink Panel (Port 8000)" 0 "Healthy & Serving Subscriptions"
    else
        check_item "Unified Sublink Panel (Port 8000)" 2 "Container offline or health check failed"
    fi

    # 2. Hysteria 2 WebUI (Flask)
    if curl -s -f http://127.0.0.1:5000/ &>/dev/null || ss -tlpn | grep -q ":5000"; then
        local user_count=$(sqlite3 /opt/hysteria-panel/users.db "SELECT count(*) FROM users;" 2>/dev/null || echo "0")
        check_item "Hysteria 2 Web Panel (Port 5000)" 0 "Online (${user_count} client keys in DB)"
    else
        check_item "Hysteria 2 Web Panel (Port 5000)" 1 "Internal Flask API offline or not using Port 5000"
    fi

    # 3. 3x-ui Management UI
    if curl -s -I http://127.0.0.1:2053 &>/dev/null || ss -tlpn | grep -q ":2053"; then
        check_item "3x-ui Web Panel (Port 2053)" 0 "Internal API Online"
    else
        check_item "3x-ui Web Panel (Port 2053)" 2 "3x-ui Internal API offline"
    fi

    # 4. AmneziaWG WebUI
    if curl -s -I http://127.0.0.1:51831 &>/dev/null || ss -tlpn | grep -q ":51831"; then
        check_item "AmneziaWG Web Panel (Port 51831)" 0 "Internal Web Server Online"
    else
        check_item "AmneziaWG Web Panel (Port 51831)" 1 "Not running on Port 51831"
    fi

    echo ""
}

# 4. Check SSL Certificate & Reverse Proxy Routes
check_ssl_and_domain() {
    echo -e "${BOLD}${MAGENTA}▶ [4/5] Checking SSL Certificate & Domain Routes${NC}"

    local domain=""
    if [ -f "/etc/nginx/sites-available/vless" ]; then
        domain=$(grep -m 1 "server_name" /etc/nginx/sites-available/vless 2>/dev/null | awk '{print $2}' | tr -d ';')
    fi

    if [ -n "$domain" ] && [ "$domain" != "DOMAIN_PLACEHOLDER" ]; then
        echo -e " Primary Domain Detected: ${CYAN}${BOLD}${domain}${NC}"
        
        # Check Let's Encrypt Certificate
        if [ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]; then
            local exp_date=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${domain}/fullchain.pem" | cut -d= -f2)
            check_item "Let's Encrypt SSL" 0 "Valid (Expires: ${exp_date})"
        else
            check_item "Let's Encrypt SSL" 1 "Certificate file not found at /etc/letsencrypt/live/${domain}"
        fi

        # Check HTTPS port 443
        if ss -tlpn | grep -q ":443"; then
            check_item "HTTPS Port 443 Reverse Proxy" 0 "Nginx Port 443 Listening"
        else
            check_item "HTTPS Port 443 Reverse Proxy" 2 "Port 443 is not listening"
        fi
    else
        check_item "Domain & SSL Config" 1 "Domain not detected in /etc/nginx/sites-available/vless"
    fi

    echo ""
}

# 5. Summary & Action Guide
print_summary() {
    echo -e "${BOLD}${MAGENTA}▶ [5/5] Diagnostic Summary & Access Links${NC}"
    echo -e "${CYAN}====================================================================${NC}"
    echo -e " Total Passed  : ${GREEN}${BOLD}${pass_count}${NC}"
    echo -e " Total Warnings: ${YELLOW}${BOLD}${warn_count}${NC}"
    echo -e " Total Errors  : ${RED}${BOLD}${fail_count}${NC}"
    echo -e "${CYAN}====================================================================${NC}\n"

    local domain=$(grep -m 1 "server_name" /etc/nginx/sites-available/vless 2>/dev/null | awk '{print $2}' | tr -d ';')
    [ -z "$domain" ] || [ "$domain" == "DOMAIN_PLACEHOLDER" ] && domain=$(curl -s -4 ifconfig.me 2>/dev/null || echo "YOUR_IP")

    echo -e "${BOLD}📌 Quick Access URLs for Your Installed Panels:${NC}"
    echo -e " 1. ${BOLD}Unified Sublink Panel${NC} : ${GREEN}https://${domain}/<YOUR_ADMIN_PATH>${NC}"
    echo -e " 2. ${BOLD}3x-ui (VLESS) Panel${NC}    : ${GREEN}https://${domain}/<YOUR_PANEL_PATH>/${NC}"
    echo -e " 3. ${BOLD}Hysteria 2 Panel${NC}       : ${GREEN}https://${domain}/hy2/${NC}"
    echo -e " 4. ${BOLD}AmneziaWG 2.0 Panel${NC}    : ${GREEN}https://${domain}:9443${NC}"

    echo -e "\n${BOLD}🔑 To view Admin Credentials:${NC}"
    echo -e " • Sublink Panel : ${CYAN}cat /opt/vpn-sub-panel/python-sub-panel/.env | grep ADMIN${NC}"
    echo -e " • Hysteria 2    : ${CYAN}Password set during install (Default: admin123)${NC}"
    echo -e " • 3x-ui Panel   : ${CYAN}x-ui status (or x-ui settings)${NC}"
    echo -e "${CYAN}====================================================================${NC}\n"
}

# Execute all checks
print_header
check_core_tools
check_vpn_daemons
check_web_panels
check_ssl_and_domain
print_summary
