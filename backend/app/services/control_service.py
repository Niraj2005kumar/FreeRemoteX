from fastapi import HTTPException

from app.database.mongodb import sessions_collection


CONTROL_FEATURES = {
    "mouse",
    "keyboard"
}


async def check_control_permission(
    session_id: str,
    remote_id: str,
    feature: str
):
    if feature not in CONTROL_FEATURES:
        raise HTTPException(
            status_code=400,
            detail="Invalid control feature"
        )

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    if session.get("status") != "active":
        raise HTTPException(
            status_code=400,
            detail="Session is not active"
        )

    if remote_id not in {
        session.get("user_a_remote_id"),
        session.get("user_b_remote_id")
    }:
        raise HTTPException(
            status_code=403,
            detail="You are not part of this session"
        )

    permission = session.get(
        "permissions",
        {}
    ).get(feature)

    if permission is not True:
        raise HTTPException(
            status_code=403,
            detail=f"Permission for '{feature}' is not approved"
        )

    return True