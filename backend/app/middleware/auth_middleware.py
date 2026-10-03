from fastapi import Header, HTTPException

from app.utils.security import decode_access_token
from app.database.mongodb import users_collection


async def get_current_user(
    authorization: str = Header(...)
):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization header is required"
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization format"
        )

    token = authorization.replace(
        "Bearer ",
        "",
        1
    ).strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Access token is missing"
        )

    payload = decode_access_token(
        token
    )

    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Token expired or invalid"
        )

    email = payload.get(
        "sub"
    )

    if not email:
        raise HTTPException(
            status_code=401,
            detail="Invalid token payload"
        )

    user = await users_collection.find_one({
        "email": email
    })

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    user.pop(
        "password",
        None
    )

    user.pop(
        "hashed_password",
        None
    )

    return user