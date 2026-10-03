from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    name: str = Field(
        ...,
        min_length=2,
        max_length=100
    )
    email: EmailStr
    remote_id: str = Field(
        ...,
        min_length=3,
        max_length=50
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128
    )


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(
        ...,
        min_length=8,
        max_length=128
    )