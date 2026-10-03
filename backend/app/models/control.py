from pydantic import BaseModel, Field


class MouseCommand(BaseModel):
    session_id: str = Field(
        ...,
        min_length=1,
        max_length=100
    )
    action: str = Field(
        ...,
        min_length=1,
        max_length=30
    )
    x: float | None = None
    y: float | None = None
    button: str | None = None


class KeyboardCommand(BaseModel):
    session_id: str = Field(
        ...,
        min_length=1,
        max_length=100
    )
    action: str = Field(
        ...,
        min_length=1,
        max_length=30
    )
    key: str = Field(
        ...,
        min_length=1,
        max_length=100
    )