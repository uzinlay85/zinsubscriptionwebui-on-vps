---
name: vpn-subscription-manager
description: A specialized guide for implementing, debugging, and maintaining VPN integrations (Outline, Hysteria2, 3x-ui) in this subscription manager panel.
---
# VPN Subscription Manager Integration Guide

This skill provides step-by-step guidance, implementation standards, and troubleshooting procedures for managing integrations with Outline, Hysteria2, and 3x-ui VPN servers.

## When to Use This Skill
Activate this skill when:
- Creating, editing, or debugging VPN integration APIs in `src/lib/`.
- Enhancing server sync cron jobs, background tasks, or auto block/unblock logic on server events.
- Troubleshooting connection errors or authentication issues with remote VPN API endpoints.

## VPN Protocols & Integration Details

### 1. Outline Server Management
- **Endpoints**:
  - `/access-keys`: `POST` to create keys, `GET` to list keys.
  - `/access-keys/{id}`: `DELETE` to delete keys.
  - `/access-keys/{id}/name`: `PUT` to update key names.
  - `/access-keys/{id}/data-limit`: `PUT` to set limits, `DELETE` to remove limits.
  - `/metrics/transfer`: `GET` to check usage.
- **Security**: Self-signed certs require bypassing Node.js SSL verification (`rejectUnauthorized: false`).
- **Timeout**: Enforce a 5000ms timeout on all HTTPS requests.

### 2. Hysteria2 Server Management
- **Backend requirement**: Integrates with [Hysteria2 Express Backend](https://github.com/sin-ack/hysteria2-express-backend).
- **Authentication**: Basic Authentication with custom admin username and password.
- **Endpoints**:
  - `/users`: `POST` to create users, `GET` to retrieve users.
  - `/users/{email}`: `DELETE` to delete users.
- **Timeout**: Enforce a 5000ms timeout using `AbortSignal.timeout(5000)`.

### 3. 3x-ui (Xray Panel) Management
- **Authentication**: Cookie-based session.
  - Login requires extracting `csrf-token` from `/` first, then posting to `/login` to acquire the session cookie.
- **Endpoints**:
  - `/panel/api/inbounds/get/{inboundId}`: `GET` existing inbound config.
  - `/panel/api/inbounds/addClient`: `POST` VMess/VLESS/Trojan client key config.
  - `/panel/api/inbounds/updateClient/{uuid}`: `POST` update key configuration, including toggle enable/disable.
  - `/panel/api/inbounds/delClient/{inboundId}/{uuid}`: `POST` delete client key.
- **JSON Handling**: Client configs are stored in serialized JSON format in 3x-ui settings database. Always parse/serialize correctly.

## Common Code Patterns
- Enforce standard `AbortSignal.timeout(5000)` in native fetches.
- Return mock or empty states on connection timeout/refusal to avoid breaking sync crons.
- Encapsulate server types in polymorphic patterns when checking data usage or blocking clients.
