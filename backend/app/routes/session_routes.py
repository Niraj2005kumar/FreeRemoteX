from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth_middleware import get_current_user
from app.database.mongodb import sessions_collection

router = APIRouter(prefix="/session", tags=["Session"])


@router.get("/history")
async def get_session_history(current_user: dict = Depends(get_current_user)):
    """Logged-in user ke saare past aur active sessions dikhao"""
    remote_id = current_user["remote_id"]

    cursor = sessions_collection.find({
        "$or": [
            {"user_a_remote_id": remote_id},
            {"user_b_remote_id": remote_id}
        ]
    }).sort("created_at", -1)

    sessions = []
    async for session in cursor:
        other_remote_id = (
            session["user_b_remote_id"]
            if session["user_a_remote_id"] == remote_id
            else session["user_a_remote_id"]
        )

        sessions.append({
            "session_id": session["session_id"],
            "with_remote_id": other_remote_id,
            "status": session["status"],
            "created_at": session["created_at"]
        })

    return {"sessions": sessions}


@router.get("/{session_id}")
async def get_session_details(session_id: str, current_user: dict = Depends(get_current_user)):
    """Ek specific session ki pura detail (permissions samet)"""
    session = await sessions_collection.find_one({"session_id": session_id})

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    remote_id = current_user["remote_id"]
    if remote_id not in [session["user_a_remote_id"], session["user_b_remote_id"]]:
        raise HTTPException(status_code=403, detail="You are not part of this session")

    other_remote_id = (
        session["user_b_remote_id"]
        if session["user_a_remote_id"] == remote_id
        else session["user_a_remote_id"]
    )

    return {
        "session_id": session["session_id"],
        "with_remote_id": other_remote_id,
        "status": session["status"],
        "permissions": session["permissions"],
        "created_at": session["created_at"]
    }


@router.post("/{session_id}/end")
async def end_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """Session ko manually end karo"""
    session = await sessions_collection.find_one({"session_id": session_id})

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    remote_id = current_user["remote_id"]
    if remote_id not in [session["user_a_remote_id"], session["user_b_remote_id"]]:
        raise HTTPException(status_code=403, detail="You are not part of this session")

    await sessions_collection.update_one(
        {"session_id": session_id},
        {"$set": {"status": "ended"}}
    )

    return {"message": "Session ended"}