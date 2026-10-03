from pydantic import BaseModel, Field


class ChatMessageCreate(BaseModel):
    session_id: str = Field(
        ...,
        min_length=1,
        max_length=100
    )
    message: str = Field(
        ...,
        min_length=1,
        max_length=5000
    )