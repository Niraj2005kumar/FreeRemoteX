from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid

from app.middleware.auth_middleware import get_current_user
from app.models.connection_request import ConnectionRequestCreate
from app.websocket.connection_manager import manager
from app.database.mongodb import (
    connection_requests_collection,
    users_collection,
    sessions_collection
)


router = APIRouter(
    prefix="/connection",
    tags=["Connection"]
)


@router.post("/request")
async def send_connection_request(
    data: ConnectionRequestCreate,
    current_user: dict = Depends(get_current_user)
):

    current_remote_id = current_user["remote_id"]

    target_user = await users_collection.find_one({
        "remote_id": data.target_remote_id
    })

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="No user found with this Remote ID"
        )

    if data.target_remote_id == current_remote_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot connect to yourself"
        )

    existing_request = await connection_requests_collection.find_one({
        "from_remote_id": current_remote_id,
        "to_remote_id": data.target_remote_id,
        "status": "pending"
    })

    if existing_request:
        raise HTTPException(
            status_code=400,
            detail="Connection request already pending"
        )

    existing_reverse_request = await connection_requests_collection.find_one({
        "from_remote_id": data.target_remote_id,
        "to_remote_id": current_remote_id,
        "status": "pending"
    })

    if existing_reverse_request:
        raise HTTPException(
            status_code=400,
            detail="This user has already sent you a connection request"
        )

    active_session = await sessions_collection.find_one({
        "$or": [
            {
                "user_a_remote_id": current_remote_id,
                "user_b_remote_id": data.target_remote_id,
                "status": "active"
            },
            {
                "user_a_remote_id": data.target_remote_id,
                "user_b_remote_id": current_remote_id,
                "status": "active"
            }
        ]
    })

    if active_session:
        raise HTTPException(
            status_code=400,
            detail="Active session already exists"
        )

    request_id = str(uuid.uuid4())

    request_doc = {
        "request_id": request_id,
        "from_remote_id": current_remote_id,
        "from_name": current_user.get("name", ""),
        "to_remote_id": data.target_remote_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
        "responded_at": None
    }

    await connection_requests_collection.insert_one(
        request_doc
    )

    await manager.send_to_user(
        data.target_remote_id,
        {
            "type": "connection_request",
            "request_id": request_id,
            "from_remote_id": current_remote_id,
            "from_name": current_user.get("name", ""),
            "created_at": request_doc[
                "created_at"
            ].isoformat()
        }
    )

    return {
        "message": "Connection request sent",
        "request_id": request_id,
        "status": "pending"
    }


@router.get("/pending")
async def get_pending_requests(
    current_user: dict = Depends(get_current_user)
):

    cursor = connection_requests_collection.find({
        "to_remote_id": current_user["remote_id"],
        "status": "pending"
    }).sort(
        "created_at",
        -1
    )

    requests = []

    async for req in cursor:

        requests.append({
            "request_id": req.get(
                "request_id"
            ),
            "from_remote_id": req.get(
                "from_remote_id"
            ),
            "from_name": req.get(
                "from_name"
            ),
            "status": req.get(
                "status"
            ),
            "created_at": req.get(
                "created_at"
            ).isoformat()
            if req.get("created_at")
            else None
        })

    return {
        "pending_requests": requests
    }


@router.post("/respond/{request_id}")
async def respond_to_request(
    request_id: str,
    accept: bool,
    current_user: dict = Depends(get_current_user)
):

    current_remote_id = current_user["remote_id"]

    request_doc = await connection_requests_collection.find_one({
        "request_id": request_id
    })

    if not request_doc:
        raise HTTPException(
            status_code=404,
            detail="Connection request not found"
        )

    if request_doc.get(
        "to_remote_id"
    ) != current_remote_id:

        raise HTTPException(
            status_code=403,
            detail="Not authorized to respond to this request"
        )

    if request_doc.get(
        "status"
    ) != "pending":

        raise HTTPException(
            status_code=400,
            detail="Request already responded to"
        )

    new_status = (
        "accepted"
        if accept
        else "rejected"
    )

    now = datetime.now(
        timezone.utc
    )

    await connection_requests_collection.update_one(
        {
            "request_id": request_id,
            "status": "pending"
        },
        {
            "$set": {
                "status": new_status,
                "responded_at": now
            }
        }
    )

    await manager.send_to_user(
        request_doc["from_remote_id"],
        {
            "type": "connection_response",
            "request_id": request_id,
            "status": new_status,
            "responder_remote_id": current_remote_id
        }
    )

    if not accept:

        return {
            "message": "Connection request rejected",
            "request_id": request_id,
            "status": "rejected"
        }

    existing_session = await sessions_collection.find_one({
        "$or": [
            {
                "user_a_remote_id": request_doc["from_remote_id"],
                "user_b_remote_id": current_remote_id,
                "status": "active"
            },
            {
                "user_a_remote_id": current_remote_id,
                "user_b_remote_id": request_doc["from_remote_id"],
                "status": "active"
            }
        ]
    })

    if existing_session:

        return {
            "message": "Connection accepted",
            "session_id": existing_session["session_id"],
            "status": "accepted"
        }

    session_id = (
        "SES-" +
        uuid.uuid4().hex[:12].upper()
    )

    session_doc = {
        "session_id": session_id,
        "user_a_remote_id": request_doc[
            "from_remote_id"
        ],
        "user_b_remote_id": current_remote_id,
        "status": "active",
        "permissions": {
            "video": False,
            "voice": False,
            "screen": False,
            "chat": False,
            "mouse": False,
            "keyboard": False,
            "file_transfer": False,
            "translation": False
        },
        "permission_requests": {},
        "created_at": now,
        "ended_at": None
    }

    await sessions_collection.insert_one(
        session_doc
    )

    session_message = {
        "type": "session_created",
        "session_id": session_id,
        "user_a_remote_id": request_doc[
            "from_remote_id"
        ],
        "user_b_remote_id": current_remote_id,
        "status": "active",
        "permissions": session_doc[
            "permissions"
        ]
    }

    await manager.send_to_user(
        request_doc["from_remote_id"],
        session_message
    )

    await manager.send_to_user(
        current_remote_id,
        session_message
    )

    return {
        "message": "Connection request accepted",
        "request_id": request_id,
        "session_id": session_id,
        "status": "accepted",
        "permissions": session_doc[
            "permissions"
        ]
    }


@router.get("/sent")
async def get_sent_requests(
    current_user: dict = Depends(get_current_user)
):

    cursor = connection_requests_collection.find({
        "from_remote_id": current_user["remote_id"]
    }).sort(
        "created_at",
        -1
    )

    requests = []

    async for req in cursor:

        requests.append({
            "request_id": req.get(
                "request_id"
            ),
            "to_remote_id": req.get(
                "to_remote_id"
            ),
            "status": req.get(
                "status"
            ),
            "created_at": req.get(
                "created_at"
            ).isoformat()
            if req.get("created_at")
            else None,
            "responded_at": req.get(
                "responded_at"
            ).isoformat()
            if req.get("responded_at")
            else None
        })

    return {
        "sent_requests": requests
    }