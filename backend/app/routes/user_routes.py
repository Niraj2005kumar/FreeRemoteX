from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth_middleware import get_current_user
from app.database.mongodb import users_collection


router = APIRouter(
    prefix="/user",
    tags=["User"]
)


@router.get("/me")
async def get_my_profile(
    current_user: dict = Depends(
        get_current_user
    )
):

    return {
        "name": current_user.get(
            "name"
        ),
        "email": current_user.get(
            "email"
        ),
        "remote_id": current_user.get(
            "remote_id"
        )
    }


@router.get("/{remote_id}")
async def get_user_by_remote_id(
    remote_id: str,
    current_user: dict = Depends(
        get_current_user
    )
):

    user = await users_collection.find_one({
        "remote_id": remote_id
    })

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return {
        "name": user.get(
            "name"
        ),
        "email": user.get(
            "email"
        ),
        "remote_id": user.get(
            "remote_id"
        )
    }