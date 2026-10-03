from pydantic import BaseModel, Field


class ConnectionRequestCreate(BaseModel):
    receiver_id: str = Field(
        min_length=5,
        max_length=30
    )


class ConnectionResponse(BaseModel):
    request_id: str
    sender_id: str
    receiver_id: str
    status: str
    created_at: str