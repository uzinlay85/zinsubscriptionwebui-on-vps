from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Setting
from app.schemas import SettingsUpdate, SettingsResponse
from typing import Dict, Any
import json

router = APIRouter()

@router.get("/", response_model=List[SettingsResponse])
async def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Setting).all()
    return [{"key": s.key, "value": s.value} for s in settings]

@router.post("/")
async def update_settings(settings_req: SettingsUpdate, db: Session = Depends(get_db)):
    for key, value in settings_req.settings.items():
        setting = db.query(Setting).filter(Setting.key == key).first()
        if setting:
            setting.value = str(value)
        else:
            setting = Setting(key=key, value=str(value))
            db.add(setting)
    db.commit()
    return {"ok": True}
