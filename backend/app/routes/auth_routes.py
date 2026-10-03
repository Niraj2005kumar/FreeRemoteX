from fastapi import APIRouter, HTTPException

from app.database.mongodb import users_collection
from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token
)
from app.schemas.user_schema import (
    UserRegister,
    UserLogin
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


@router.post("/register")
async def register(
    data: UserRegister
):

    existing_user = await users_collection.find_one({
        "email": data.email
    })

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    existing_remote_id = await users_collection.find_one({
        "remote_id": data.remote_id
    })

    if existing_remote_id:
        raise HTTPException(
            status_code=400,
            detail="Remote ID already exists"
        )

    hashed_password = hash_password(
        data.password
    )

    user = {
        "name": data.name,
        "email": data.email,
        "remote_id": data.remote_id,
        "password": hashed_password
    }

    await users_collection.insert_one(
        user
    )

    return {
        "message": "User registered successfully",
        "remote_id": data.remote_id
    }


@router.post("/login")
async def login(
    data: UserLogin
):

    user = await users_collection.find_one({
        "email": data.email
    })

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not verify_password(
        data.password,
        user["password"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    access_token = create_access_token({
        "sub": user["email"],
        "remote_id": user["remote_id"]
    })

    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "remote_id": user["remote_id"]
    }