from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/panel.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

import logging

logger = logging.getLogger(__name__)

if "sqlite" in DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def init_db():
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError
    
    migrations = [
        # Clients columns
        "ALTER TABLE clients ADD COLUMN last_seen TEXT;",
        "ALTER TABLE clients ADD COLUMN notes TEXT;",
        "ALTER TABLE clients ADD COLUMN contact TEXT;",
        "ALTER TABLE clients ADD COLUMN plan_price TEXT;",
        "ALTER TABLE clients ADD COLUMN total_usage_bytes BIGINT DEFAULT 0;",
        "ALTER TABLE clients ADD COLUMN expiry_date TEXT;",
        "ALTER TABLE clients ADD COLUMN data_limit_gb INTEGER;",
        
        # Servers columns
        "ALTER TABLE servers ADD COLUMN type TEXT DEFAULT 'outline';",
        "ALTER TABLE servers ADD COLUMN cert_sha256 TEXT;",
        "ALTER TABLE servers ADD COLUMN auth_username TEXT;",
        "ALTER TABLE servers ADD COLUMN auth_password TEXT;",
        "ALTER TABLE servers ADD COLUMN username TEXT;",
        "ALTER TABLE servers ADD COLUMN password TEXT;",
        "ALTER TABLE servers ADD COLUMN inbound_id INTEGER;",
        "ALTER TABLE servers ADD COLUMN external_domain TEXT;",
        "ALTER TABLE servers ADD COLUMN external_port INTEGER;",
        "ALTER TABLE servers ADD COLUMN is_active BOOLEAN DEFAULT 1;",
        "ALTER TABLE servers ADD COLUMN country_code TEXT;",
        "ALTER TABLE servers ADD COLUMN country_name TEXT;",
        
        # Client Keys columns
        "ALTER TABLE client_keys ADD COLUMN uuid TEXT;",
        "ALTER TABLE client_keys ADD COLUMN last_seen_bytes BIGINT DEFAULT 0;",
        "ALTER TABLE client_keys ADD COLUMN is_online BOOLEAN DEFAULT 0;",
        "ALTER TABLE client_keys ADD COLUMN last_seen TEXT;",
        "ALTER TABLE client_keys ADD COLUMN remote_id TEXT;",
        "ALTER TABLE client_keys ADD COLUMN remote_username TEXT;",
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except OperationalError as oe:
                # Column already exists in SQLite
                if "duplicate column name" not in str(oe).lower():
                    logger.debug(f"Migration note: {oe}")
            except Exception as e:
                logger.debug(f"Migration note on '{stmt}': {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
