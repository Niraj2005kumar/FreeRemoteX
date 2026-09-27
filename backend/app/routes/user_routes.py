from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth_middleware import get_current_user
from app.database.mongodb import users_collection

router = APIRouter(prefix="/user", tags=["User"])

@router.get("/me")
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    return {
        "name": current_user["name"],
        "email": current_user["email"],
        "remote_id": current_user["remote_id"],
        "language_preference": current_user["language_preference"]
    }

@router.get("/find/{remote_id}")
async def find_user_by_remote_id(remote_id: str, current_user: dict = Depends(get_current_user)):
    """
    Ye API dusre user ka basic info dega uske Remote ID se,
    taaki connection request bhejne se pehle uska naam dikh sake.
    """
    target_user = await users_collection.find_one({"remote_id": remote_id})

    if not target_user:
        raise HTTPException(status_code=404, detail="No user found with this Remote ID")

    if target_user["remote_id"] == current_user["remote_id"]:
        raise HTTPException(status_code=400, detail="You cannot connect to yourself")

    return {
        "name": target_user["name"],
        "remote_id": target_user["remote_id"]
    }