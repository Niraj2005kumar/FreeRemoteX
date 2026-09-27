from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ConnectionRequestCreate(BaseModel):
    target_remote_id: str  # jisko request bhej rahe hain

class ConnectionRequestOut(BaseModel):
    request_id: str
    from_remote_id: str
    from_name: str
    to_remote_id: str
    status: str  # pending, accepted, rejected
    created_at: datetime