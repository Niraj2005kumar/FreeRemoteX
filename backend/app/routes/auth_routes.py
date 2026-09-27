from fastapi import APIRouter, HTTPException
from app.models.user import UserSignup, UserLogin, generate_remote_id
from app.database.mongodb import users_collection
from app.utils.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/signup")
async def signup(user: UserSignup):
    # Check if email already exists
    existing_user = await users_collection.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pw = hash_password(user.password)
    remote_id = generate_remote_id()

    new_user = {
        "name": user.name,
        "email": user.email,
        "password": hashed_pw,
        "remote_id": remote_id,
        "language_preference": user.language_preference,
    }

    await users_collection.insert_one(new_user)

    return {
        "message": "Signup successful",
        "remote_id": remote_id
    }

@router.post("/login")
async def login(user: UserLogin):
    db_user = await users_collection.find_one({"email": user.email})
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid email or password")

    if not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    token = create_access_token({"sub": db_user["email"], "remote_id": db_user["remote_id"]})

    return {
        "message": "Login successful",
        "access_token": token,
        "token_type": "bearer",
        "remote_id": db_user["remote_id"],
        "name": db_user["name"]
    }