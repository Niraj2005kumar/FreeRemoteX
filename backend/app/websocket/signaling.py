from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket.connection_manager import manager
from app.services.webrtc_service import check_webrtc_permission


router = APIRouter(
    tags=["WebRTC Signaling"]
)


@router.websocket("/ws/signaling/{remote_id}")
async def signaling_endpoint(
    websocket: WebSocket,
    remote_id: str
):

    await manager.connect(
        remote_id,
        websocket
    )

    try:

        while True:

            data = await websocket.receive_json()

            message_type = data.get("type")
            target_remote_id = data.get("target_remote_id")
            session_id = data.get("session_id")
            feature = data.get("feature")

            if not message_type:
                await websocket.send_json({
                    "type": "error",
                    "message": "Message type is required"
                })
                continue

            if not target_remote_id:
                await websocket.send_json({
                    "type": "error",
                    "message": "target_remote_id is required"
                })
                continue

            if not session_id:
                await websocket.send_json({
                    "type": "error",
                    "message": "session_id is required"
                })
                continue

            if message_type in {
                "offer",
                "answer",
                "ice-candidate"
            }:

                if feature not in {
                    "video",
                    "voice",
                    "screen"
                }:

                    await websocket.send_json({
                        "type": "error",
                        "message": "Valid WebRTC feature is required"
                    })

                    continue

                try:

                    await check_webrtc_permission(
                        session_id=session_id,
                        remote_id=remote_id,
                        feature=feature
                    )

                except Exception as e:

                    await websocket.send_json({
                        "type": "permission_denied",
                        "message": str(e.detail)
                        if hasattr(e, "detail")
                        else "WebRTC permission denied"
                    })

                    continue

            message = {
                "type": message_type,
                "session_id": session_id,
                "feature": feature,
                "from_remote_id": remote_id,
                "data": data.get("data")
            }

            sent = await manager.send_to_user(
                target_remote_id,
                message
            )

            if not sent:

                await websocket.send_json({
                    "type": "user_offline",
                    "target_remote_id": target_remote_id
                })

    except WebSocketDisconnect:

        manager.disconnect(
            remote_id
        )

    except Exception as e:

        print(
            f"Signaling error for {remote_id}: {e}"
        )

        manager.disconnect(
            remote_id
        )