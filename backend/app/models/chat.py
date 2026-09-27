from pydantic import BaseModel
from datetime import datetime

class ChatMessageCreate(BaseModel):
    session_id: str
    message: str

class ChatMessageOut(BaseModel):
    session_id: str
    from_remote_id: str
    message: str
    timestamp: datetime