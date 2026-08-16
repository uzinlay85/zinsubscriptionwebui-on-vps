from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ServerBase(BaseModel):
    name: str
    api_url: str
    cert_sha256: Optional[str] = None
    type: str = "outline"
    auth_username: Optional[str] = None
    auth_password: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    inbound_id: Optional[int] = None
    external_domain: Optional[str] = None
    external_port: Optional[int] = None
    is_active: Optional[bool] = True

class ServerCreate(ServerBase):
    pass

class ServerUpdate(BaseModel):
    name: Optional[str] = None
    api_url: Optional[str] = None
    type: Optional[str] = None
    cert_sha256: Optional[str] = None
    auth_username: Optional[str] = None
    auth_password: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    inbound_id: Optional[int] = None
    external_domain: Optional[str] = None
    external_port: Optional[int] = None
    is_active: Optional[bool] = None

class ServerResponse(ServerBase):
    id: str
    created_at: str

class ClientBase(BaseModel):
    name: str
    status: str = "active"
    expiry_date: Optional[str] = None
    data_limit_gb: Optional[int] = None
    notes: Optional[str] = None
    contact: Optional[str] = None
    plan_price: Optional[str] = None

class ClientCreate(ClientBase):
    server_ids: Optional[List[str]] = None

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    expiry_date: Optional[str] = None
    data_limit_gb: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    contact: Optional[str] = None
    plan_price: Optional[str] = None

class QuickRenewRequest(BaseModel):
    days: Optional[int] = 30
    add_gb: Optional[int] = None
    reset_usage: Optional[bool] = True

class ClientResponse(ClientBase):
    id: str
    sub_token: str
    created_at: str
    total_usage_bytes: int
    last_seen: Optional[str] = None
    is_online: Optional[bool] = False
    remaining_time: Optional[str] = None

class ClientKeyResponse(BaseModel):
    id: str
    server_id: str
    outline_key_id: str
    access_url: str
    created_at: str
    uuid: Optional[str] = None
    last_seen_bytes: int
    server_name: Optional[str] = None
    server_type: Optional[str] = None

class ClientDetailResponse(ClientResponse):
    keys: List[ClientKeyResponse] = []

class LoginRequest(BaseModel):
    username: str
    password: str

class SettingsResponse(BaseModel):
    key: str
    value: str

class SettingsUpdate(BaseModel):
    settings: Dict[str, Any]

class BackupExportResponse(BaseModel):
    version: str
    timestamp: str
    servers: List[Dict[str, Any]]
    clients: List[Dict[str, Any]]
    client_keys: List[Dict[str, Any]]

class UsageMetricsResponse(BaseModel):
    metricsMap: Dict[str, Dict[str, int]]

class ServerStatusResponse(BaseModel):
    id: str
    online: bool
    latency: Optional[int] = None

class SubTokenResponse(BaseModel):
    ok: bool
    sub_url: str

class OrphanKeyResponse(BaseModel):
    key_id: str
    name: str
    access_url: Optional[str] = None
