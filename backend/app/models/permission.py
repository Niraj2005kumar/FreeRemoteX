from pydantic import BaseModel, Field


VALID_FEATURES = {
    "video",
    "voice",
    "chat",
    "screen",
    "mouse",
    "keyboard",
    "file_transfer",
    "translation"
}


class PermissionRequest(BaseModel):
    session_id: str = Field(
        ...,
        min_length=1
    )
    feature: str = Field(
        ...,
        min_length=1
    )


class PermissionResponse(BaseModel):
    session_id: str = Field(
        ...,
        min_length=1
    )
    feature: str = Field(
        ...,
        min_length=1
    )
    approved: bool