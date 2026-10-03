from pydantic import BaseModel, Field
from datetime import datetime


class SessionCreate(BaseModel):
    user_b_remote_id: str = Field(
        ...,
        min_length=3,
        max_length=50
    )


class SessionResponse(BaseModel):
    session_id: str
    user_a_remote_id: str
    user_b_remote_id: str
    status: str
    permissions: dict[str, bool]
    created_at: datetime