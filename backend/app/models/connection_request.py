from pydantic import BaseModel, Field
from datetime import datetime


class ConnectionRequestCreate(BaseModel):
    target_remote_id: str = Field(
        ...,
        min_length=3,
        max_length=50
    )


class ConnectionRequestOut(BaseModel):
    request_id: str
    from_remote_id: str
    from_name: str
    to_remote_id: str
    status: str
    created_at: datetime