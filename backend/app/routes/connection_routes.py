from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
import uuid

from app.middleware.auth_middleware import get_current_user
from app.models.connection_request import ConnectionRequestCreate
from app.websocket.connection_manager import manager
from app.database.mongodb import (
    connection_requests_collection,
    users_collection,
    sessions_collection
)

router = APIRouter(prefix="/connection", tags=["Connection"])


@router.post("/request")
async def send_connection_request(
    data: ConnectionRequestCreate,
    current_user: dict = Depends(get_current_user)
):
    target_user = await users_collection.find_one({"remote_id": data.target_remote_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="No user found with this Remote ID")

    if target_user["remote_id"] == current_user["remote_id"]:
        raise HTTPException(status_code=400, detail="You cannot connect to yourself")

    request_id = str(uuid.uuid4())

    request_doc = {
        "request_id": request_id,
        "from_remote_id": current_user["remote_id"],
        "from_name": current_user["name"],
        "to_remote_id": data.target_remote_id,
        "status": "pending",
        "created_at": datetime.utcnow()
    }

    await connection_requests_collection.insert_one(request_doc)

    # 🔔 Real-time notification bhejo target user ko (agar wo online hai)
    await manager.send_to_user(data.target_remote_id, {
        "type": "connection_request",
        "request_id": request_id,
        "from_remote_id": current_user["remote_id"],
        "from_name": current_user["name"]
    })

    return {
        "message": "Connection request sent",
        "request_id": request_id
    }


@router.get("/pending")
async def get_pending_requests(current_user: dict = Depends(get_current_user)):
    cursor = connection_requests_collection.find({
        "to_remote_id": current_user["remote_id"],
        "status": "pending"
    })

    requests = []
    async for req in cursor:
        requests.append({
            "request_id": req["request_id"],
            "from_remote_id": req["from_remote_id"],
            "from_name": req["from_name"],
            "created_at": req["created_at"]
        })

    return {"pending_requests": requests}


@router.post("/respond/{request_id}")
async def respond_to_request(
    request_id: str,
    accept: bool,
    current_user: dict = Depends(get_current_user)
):
    req = await connection_requests_collection.find_one({"request_id": request_id})

    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req["to_remote_id"] != current_user["remote_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to respond to this request")

    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request already responded to")

    new_status = "accepted" if accept else "rejected"
    await connection_requests_collection.update_one(
        {"request_id": request_id},
        {"$set": {"status": new_status}}
    )

    # 🔔 Notify requester about the response
    await manager.send_to_user(req["from_remote_id"], {
        "type": "connection_response",
        "status": new_status,
        "responder_remote_id": current_user["remote_id"]
    })

    if not accept:
        return {"message": "Connection request rejected"}

    session_id = str(uuid.uuid4())
    session_doc = {
        "session_id": session_id,
        "user_a_remote_id": req["from_remote_id"],
        "user_b_remote_id": req["to_remote_id"],
        "status": "active",
        "permissions": {
            "video_call": False,
            "voice_call": False,
            "chat": False,
            "screen_share": False,
            "mouse_control": False,
            "keyboard_control": False,
            "file_transfer": False,
            "translation": False
        },
        "created_at": datetime.utcnow()
    }

    await sessions_collection.insert_one(session_doc)

    # 🔔 Dono users ko session_id bhejo
    await manager.send_to_user(req["from_remote_id"], {
        "type": "session_created",
        "session_id": session_id
    })

    return {
        "message": "Connection request accepted",
        "session_id": session_id
    }