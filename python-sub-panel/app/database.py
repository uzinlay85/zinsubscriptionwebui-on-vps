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
        "ALTER TABLE clients ADD COLUMN last_seen TEXT;",
        "ALTER TABLE clients ADD COLUMN notes TEXT;",
        "ALTER TABLE clients ADD COLUMN contact TEXT;",
        "ALTER TABLE clients ADD COLUMN plan_price TEXT;",
        "ALTER TABLE servers ADD COLUMN is_active BOOLEAN DEFAULT 1;",
        "ALTER TABLE servers ADD COLUMN country_code TEXT;",
        "ALTER TABLE servers ADD COLUMN country_name TEXT;",
        "ALTER TABLE client_keys ADD COLUMN is_online BOOLEAN DEFAULT 0;",
        "ALTER TABLE client_keys ADD COLUMN last_seen TEXT;",
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
                logger.error(f"Migration error on '{stmt}': {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
