from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime, timezone

from app.database.mongodb import database
from app.services.agent_service import authenticate_agent
from app.websocket.connection_manager import manager


router = APIRouter(
    tags=["Desktop Agent WebSocket"]
)


agents_collection = database[
    "desktop_agents"
]


@router.websocket(
    "/ws/agent/{agent_id}"
)
async def agent_websocket(
    websocket: WebSocket,
    agent_id: str
):

    agent_token = websocket.query_params.get(
        "token"
    )

    try:
        agent = await authenticate_agent(
            agent_id,
            agent_token
        )

    except Exception:
        await websocket.close(
            code=1008
        )
        return

    remote_id = agent["remote_id"]

    await manager.connect(
        remote_id,
        websocket
    )

    await agents_collection.update_one(
        {
            "agent_id": agent_id
        },
        {
            "$set": {
                "last_connected_at": datetime.now(
                    timezone.utc
                )
            }
        }
    )

    try:

        while True:

            data = await websocket.receive_json()

            message_type = data.get(
                "type"
            )

            if message_type == "agent_status":

                await websocket.send_json({
                    "type": "agent_status",
                    "status": "connected",
                    "agent_id": agent_id
                })

                continue

            if message_type == "heartbeat":

                await websocket.send_json({
                    "type": "heartbeat",
                    "status": "ok"
                })

                continue

            await websocket.send_json({
                "type": "error",
                "message": "Unknown agent message"
            })

    except WebSocketDisconnect:

        manager.disconnect(
            remote_id
        )

    except Exception:

        manager.disconnect(
            remote_id
        )