from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth_middleware import get_current_user
from app.models.permission import PermissionRequest, PermissionResponse, VALID_FEATURES
from app.websocket.connection_manager import manager
from app.database.mongodb import sessions_collection

router = APIRouter(prefix="/permission", tags=["Permission"])


def get_other_user_remote_id(session: dict, current_remote_id: str) -> str:
    """Session ke andar dusra user kaun hai, wo nikaalne ke liye helper"""
    if session["user_a_remote_id"] == current_remote_id:
        return session["user_b_remote_id"]
    return session["user_a_remote_id"]


@router.post("/request")
async def request_permission(
    data: PermissionRequest,
    current_user: dict = Depends(get_current_user)
):
    if data.feature not in VALID_FEATURES:
        raise HTTPException(status_code=400, detail="Invalid feature name")

    session = await sessions_collection.find_one({"session_id": data.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    other_remote_id = get_other_user_remote_id(session, current_user["remote_id"])

    # 🔔 Dusre user ko real-time permission request bhejo
    await manager.send_to_user(other_remote_id, {
        "type": "permission_request",
        "session_id": data.session_id,
        "feature": data.feature,
        "from_remote_id": current_user["remote_id"]
    })

    return {
        "message": f"Permission request for '{data.feature}' sent",
        "session_id": data.session_id
    }


@router.post("/respond")
async def respond_permission(
    data: PermissionResponse,
    current_user: dict = Depends(get_current_user)
):
    if data.feature not in VALID_FEATURES:
        raise HTTPException(status_code=400, detail="Invalid feature name")

    session = await sessions_collection.find_one({"session_id": data.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await sessions_collection.update_one(
        {"session_id": data.session_id},
        {"$set": {f"permissions.{data.feature}": data.approved}}
    )

    other_remote_id = get_other_user_remote_id(session, current_user["remote_id"])

    # 🔔 Requester ko response bhejo
    await manager.send_to_user(other_remote_id, {
        "type": "permission_response",
        "session_id": data.session_id,
        "feature": data.feature,
        "approved": data.approved
    })

    return {
        "message": f"Permission for '{data.feature}' {'granted' if data.approved else 'denied'}",
        "session_id": data.session_id
    }


@router.post("/revoke")
async def revoke_permission(
    data: PermissionResponse,
    current_user: dict = Depends(get_current_user)
):
    session = await sessions_collection.find_one({"session_id": data.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await sessions_collection.update_one(
        {"session_id": data.session_id},
        {"$set": {f"permissions.{data.feature}": False}}
    )

    other_remote_id = get_other_user_remote_id(session, current_user["remote_id"])

    # 🔔 Dusre user ko batao ki permission revoke ho gayi
    await manager.send_to_user(other_remote_id, {
        "type": "permission_revoked",
        "session_id": data.session_id,
        "feature": data.feature
    })

    return {"message": f"Permission for '{data.feature}' revoked"}


@router.get("/status/{session_id}")
async def get_permission_status(session_id: str, current_user: dict = Depends(get_current_user)):
    session = await sessions_collection.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"session_id": session_id, "permissions": session["permissions"]}