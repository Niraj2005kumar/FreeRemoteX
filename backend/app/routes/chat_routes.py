from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid

from app.middleware.auth_middleware import get_current_user
from app.models.chat import ChatMessageCreate
from app.websocket.connection_manager import manager
from app.database.mongodb import sessions_collection, database


router = APIRouter(
    prefix="/chat",
    tags=["Chat"]
)


chat_messages_collection = database["chat_messages"]


def get_other_user_remote_id(
    session: dict,
    current_remote_id: str
) -> str:

    if session.get("user_a_remote_id") == current_remote_id:
        return session.get("user_b_remote_id")

    if session.get("user_b_remote_id") == current_remote_id:
        return session.get("user_a_remote_id")

    raise HTTPException(
        status_code=403,
        detail="You are not part of this session"
    )


def validate_session(
    session: dict,
    current_remote_id: str
):

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    if current_remote_id not in {
        session.get("user_a_remote_id"),
        session.get("user_b_remote_id")
    }:
        raise HTTPException(
            status_code=403,
            detail="You are not part of this session"
        )

    if session.get("status") != "active":
        raise HTTPException(
            status_code=400,
            detail="Session is not active"
        )


@router.post("/send")
async def send_message(
    data: ChatMessageCreate,
    current_user: dict = Depends(get_current_user)
):

    current_remote_id = current_user["remote_id"]

    if not data.message or not data.message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty"
        )

    session = await sessions_collection.find_one({
        "session_id": data.session_id
    })

    validate_session(
        session,
        current_remote_id
    )

    if session.get(
        "permissions",
        {}
    ).get("chat") is not True:

        raise HTTPException(
            status_code=403,
            detail="Chat permission not granted"
        )

    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    message_doc = {
        "message_id": str(uuid.uuid4()),
        "session_id": data.session_id,
        "from_remote_id": current_remote_id,
        "to_remote_id": other_remote_id,
        "message": data.message.strip(),
        "timestamp": datetime.now(timezone.utc)
    }

    await chat_messages_collection.insert_one(
        message_doc
    )

    await manager.send_to_user(
        other_remote_id,
        {
            "type": "chat_message",
            "session_id": data.session_id,
            "message_id": message_doc["message_id"],
            "from_remote_id": current_remote_id,
            "to_remote_id": other_remote_id,
            "message": message_doc["message"],
            "timestamp": message_doc[
                "timestamp"
            ].isoformat()
        }
    )

    return {
        "message": "Message sent",
        "message_id": message_doc["message_id"],
        "session_id": data.session_id,
        "timestamp": message_doc[
            "timestamp"
        ].isoformat()
    }


@router.get("/history/{session_id}")
async def get_chat_history(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):

    current_remote_id = current_user["remote_id"]

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    validate_session(
        session,
        current_remote_id
    )

    if session.get(
        "permissions",
        {}
    ).get("chat") is not True:

        raise HTTPException(
            status_code=403,
            detail="Chat permission not granted"
        )

    cursor = chat_messages_collection.find(
        {
            "session_id": session_id
        }
    ).sort(
        "timestamp",
        1
    )

    messages = []

    async for msg in cursor:

        messages.append({
            "message_id": msg.get(
                "message_id"
            ),
            "from_remote_id": msg.get(
                "from_remote_id"
            ),
            "to_remote_id": msg.get(
                "to_remote_id"
            ),
            "message": msg.get(
                "message"
            ),
            "timestamp": msg.get(
                "timestamp"
            ).isoformat()
            if msg.get("timestamp")
            else None
        })

    return {
        "session_id": session_id,
        "messages": messages
    }


@router.delete(
    "/history/{session_id}"
)
async def clear_chat_history(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):

    current_remote_id = current_user["remote_id"]

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    validate_session(
        session,
        current_remote_id
    )

    await chat_messages_collection.delete_many({
        "session_id": session_id
    })

    return {
        "message": "Chat history cleared",
        "session_id": session_id
    }