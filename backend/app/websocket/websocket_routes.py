from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket.connection_manager import manager


router = APIRouter(
    tags=["WebSocket"]
)


@router.websocket("/ws/{remote_id}")
async def websocket_endpoint(
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

            print(
                f"Message from {remote_id}: {data}"
            )

    except WebSocketDisconnect:
        manager.disconnect(remote_id)

    except Exception as e:
        print(
            f"WebSocket error for {remote_id}: {e}"
        )

        manager.disconnect(remote_id)