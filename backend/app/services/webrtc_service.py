from fastapi import HTTPException

from app.database.mongodb import sessions_collection


WEBRTC_FEATURES = {
    "video",
    "voice",
    "screen"
}


async def check_webrtc_permission(
    session_id: str,
    remote_id: str,
    feature: str
):

    if feature not in WEBRTC_FEATURES:
        raise HTTPException(
            status_code=400,
            detail="Invalid WebRTC feature"
        )

    session = await sessions_collection.find_one(
        {
            "session_id": session_id
        }
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    user_a = session.get(
        "user_a_remote_id"
    )

    user_b = session.get(
        "user_b_remote_id"
    )

    if remote_id not in [
        user_a,
        user_b
    ]:
        raise HTTPException(
            status_code=403,
            detail="You are not part of this session"
        )

    if session.get("status") != "active":
        raise HTTPException(
            status_code=400,
            detail="Session is not active"
        )

    permissions = session.get(
        "permissions",
        {}
    )

    if permissions.get(feature) is not True:
        raise HTTPException(
            status_code=403,
            detail=f"Permission for '{feature}' is not approved"
        )

    return True