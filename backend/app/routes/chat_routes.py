from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
import uuid

from app.middleware.auth_middleware import get_current_user
from app.models.chat import ChatMessageCreate
from app.websocket.connection_manager import manager
from app.database.mongodb import sessions_collection, database

router = APIRouter(prefix="/chat", tags=["Chat"])

chat_messages_collection = database["chat_messages"]


def get_other_user_remote_id(session: dict, current_remote_id: str) -> str:
    if session["user_a_remote_id"] == current_remote_id:
        return session["user_b_remote_id"]
    return session["user_a_remote_id"]


@router.post("/send")
async def send_message(
    data: ChatMessageCreate,
    current_user: dict = Depends(get_current_user)
):
    session = await sessions_collection.find_one({"session_id": data.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session["permissions"].get("chat", False):
        raise HTTPException(status_code=403, detail="Chat permission not granted")

    message_doc = {
        "message_id": str(uuid.uuid4()),
        "session_id": data.session_id,
        "from_remote_id": current_user["remote_id"],
        "message": data.message,
        "timestamp": datetime.utcnow()
    }

    await chat_messages_collection.insert_one(message_doc)

    other_remote_id = get_other_user_remote_id(session, current_user["remote_id"])

    # 🔔 Real-time message dusre user ko bhejo
    await manager.send_to_user(other_remote_id, {
        "type": "chat_message",
        "session_id": data.session_id,
        "from_remote_id": current_user["remote_id"],
        "message": data.message,
        "timestamp": message_doc["timestamp"].isoformat()
    })

    return {"message": "Message sent"}


@router.get("/history/{session_id}")
async def get_chat_history(session_id: str, current_user: dict = Depends(get_current_user)):
    session = await sessions_collection.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    cursor = chat_messages_collection.find({"session_id": session_id}).sort("timestamp", 1)

    messages = []
    async for msg in cursor:
        messages.append({
            "from_remote_id": msg["from_remote_id"],
            "message": msg["message"],
            "timestamp": msg["timestamp"]
        })

    return {"session_id": session_id, "messages": messages}