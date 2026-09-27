from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.websocket.connection_manager import manager
import json

router = APIRouter()

@router.websocket("/ws/{remote_id}")
async def websocket_endpoint(websocket: WebSocket, remote_id: str):
    await manager.connect(remote_id, websocket)

    try:
        while True:
            # Frontend se aane wale messages (jaise WebRTC offer/answer/ICE candidates)
            data = await websocket.receive_json()

            message_type = data.get("type")

            if message_type in ["webrtc_offer", "webrtc_answer", "ice_candidate"]:
                # WebRTC signaling data ko target user tak relay karo
                target_remote_id = data.get("target_remote_id")
                if target_remote_id:
                    await manager.send_to_user(target_remote_id, {
                        "type": message_type,
                        "from_remote_id": remote_id,
                        "payload": data.get("payload")
                    })

            elif message_type == "ping":
                # Connection alive rakhne ke liye
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(remote_id)