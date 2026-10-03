from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket.connection_manager import manager
from app.services.webrtc_service import check_webrtc_permission
from app.utils.security import decode_access_token
from app.database.mongodb import users_collection, sessions_collection


router = APIRouter(tags=["WebRTC Signaling"])


async def authenticate_websocket(
    websocket: WebSocket,
    remote_id: str
):
    token = websocket.query_params.get("token")

    if not token:
        await websocket.close(
            code=1008,
            reason="Authentication token is required"
        )
        return None

    payload = decode_access_token(token)

    if not payload:
        await websocket.close(
            code=1008,
            reason="Invalid or expired token"
        )
        return None

    token_remote_id = payload.get("remote_id")

    if not token_remote_id:
        await websocket.close(
            code=1008,
            reason="Invalid token payload"
        )
        return None

    if token_remote_id != remote_id:
        await websocket.close(
            code=1008,
            reason="Remote ID does not match token"
        )
        return None

    user = await users_collection.find_one({
        "remote_id": remote_id
    })

    if not user:
        await websocket.close(
            code=1008,
            reason="User not found"
        )
        return None

    return user


async def validate_signaling_session(
    session_id: str,
    remote_id: str,
    target_remote_id: str
):
    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    if not session:
        raise ValueError("Session not found")

    if session.get("status") != "active":
        raise ValueError("Session is not active")

    participants = {
        session.get("user_a_remote_id"),
        session.get("user_b_remote_id")
    }

    if remote_id not in participants:
        raise ValueError(
            "You are not part of this session"
        )

    if target_remote_id not in participants:
        raise ValueError(
            "Target user is not part of this session"
        )

    if remote_id == target_remote_id:
        raise ValueError(
            "You cannot send signaling messages to yourself"
        )

    return session


@router.websocket(
    "/ws/signaling/{remote_id}"
)
async def signaling_endpoint(
    websocket: WebSocket,
    remote_id: str
):
    user = await authenticate_websocket(
        websocket,
        remote_id
    )

    if not user:
        return

    await manager.connect(
        remote_id,
        websocket
    )

    try:
        while True:
            data = await websocket.receive_json()

            message_type = data.get("type")
            target_remote_id = data.get(
                "target_remote_id"
            )
            session_id = data.get(
                "session_id"
            )
            feature = data.get(
                "feature"
            )

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

            try:
                session = await validate_signaling_session(
                    session_id=session_id,
                    remote_id=remote_id,
                    target_remote_id=target_remote_id
                )
            except ValueError as e:
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
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
                        "session_id": session_id,
                        "feature": feature,
                        "message": (
                            e.detail
                            if hasattr(e, "detail")
                            else "WebRTC permission denied"
                        )
                    })
                    continue

            message = {
                "type": message_type,
                "session_id": session_id,
                "feature": feature,
                "from_remote_id": remote_id,
                "target_remote_id": target_remote_id,
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
        manager.disconnect(remote_id)

    except Exception as e:
        print(
            f"Signaling error for {remote_id}: {e}"
        )
        manager.disconnect(remote_id)