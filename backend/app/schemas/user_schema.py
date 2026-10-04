from pydantic import BaseModel, EmailStr, Field, field_validator


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

    @field_validator("password")
    @classmethod
    def validate_bcrypt_password_length(cls, password: str) -> str:
        if len(password.encode("utf-8")) > 72:
            raise ValueError("Password must not exceed 72 UTF-8 bytes")
        return password


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(
        ...,
        min_length=8,
        max_length=128
    )

    @field_validator("password")
    @classmethod
    def validate_bcrypt_password_length(cls, password: str) -> str:
        if len(password.encode("utf-8")) > 72:
            raise ValueError("Password must not exceed 72 UTF-8 bytes")
        return password