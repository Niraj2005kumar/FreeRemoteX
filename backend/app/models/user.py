from pydantic import BaseModel, EmailStr, Field
from typing import Optional
import random

class UserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str
    language_preference: Optional[str] = "English"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    name: str
    email: EmailStr
    remote_id: str
    language_preference: str

def generate_remote_id():
    # 6-digit unique-ish remote ID (jaise TeamViewer ID)
    return str(random.randint(100000, 999999))