from sqlalchemy import Column, String, Integer, BigInteger, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from app.database import Base

class Server(Base):
    __tablename__ = "servers"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    api_url = Column(String, nullable=False)
    cert_sha256 = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    type = Column(String, nullable=False, default="outline")
    auth_username = Column(String, nullable=True)
    auth_password = Column(String, nullable=True)
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)
    inbound_id = Column(Integer, nullable=True)
    external_domain = Column(String, nullable=True)
    external_port = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    country_code = Column(String, nullable=True)
    country_name = Column(String, nullable=True)

class Client(Base):
    __tablename__ = "clients"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    sub_token = Column(String, unique=True, nullable=False, index=True)
    status = Column(String, nullable=False, default="active")
    created_at = Column(String, nullable=False)
    expiry_date = Column(String, nullable=True)
    data_limit_gb = Column(Integer, nullable=True)
    total_usage_bytes = Column(BigInteger, nullable=False, default=0)
    last_seen = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    contact = Column(String, nullable=True)
    plan_price = Column(String, nullable=True)

class ClientKey(Base):
    __tablename__ = "client_keys"
    
    id = Column(String, primary_key=True, index=True)
    client_id = Column(String, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    server_id = Column(String, ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    outline_key_id = Column(String, nullable=False)
    access_url = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    uuid = Column(String, nullable=True)
    last_seen_bytes = Column(BigInteger, nullable=False, default=0)
    is_online = Column(Boolean, nullable=True, default=False)
    last_seen = Column(String, nullable=True)

class Setting(Base):
    __tablename__ = "settings"
    
    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)
