from fastapi import Depends, HTTPException, Header
from app.utils.security import decode_access_token
from app.database.mongodb import users_collection

async def get_current_user(authorization: str = Header(...)):
    """
    Frontend se request bhejte waqt header mein bhejna hoga:
    Authorization: Bearer <token>
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid or missing token")

    token = authorization.split(" ")[1]
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

    email = payload.get("sub")
    user = await users_collection.find_one({"email": email})

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user