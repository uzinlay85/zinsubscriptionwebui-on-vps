from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/panel.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

if "sqlite" in DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def init_db():
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE clients ADD COLUMN last_seen TEXT;",
        "ALTER TABLE clients ADD COLUMN notes TEXT;",
        "ALTER TABLE clients ADD COLUMN contact TEXT;",
        "ALTER TABLE clients ADD COLUMN plan_price TEXT;",
        "ALTER TABLE servers ADD COLUMN is_active BOOLEAN DEFAULT 1;",
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
