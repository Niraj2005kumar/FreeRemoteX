from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime, timezone
from typing import Dict

from app.database.mongodb import (
    database,
    sessions_collection
)

from app.services.agent_service import (
    authenticate_agent
)


router = APIRouter(
    tags=["Desktop Agent WebSocket"]
)


agents_collection = database[
    "desktop_agents"
]


class AgentConnectionManager:

    def __init__(self):
        self.active_connections: Dict[
            str,
            WebSocket
        ] = {}

    async def connect(
        self,
        agent_id: str,
        websocket: WebSocket
    ):
        await websocket.accept()

        old_connection = self.active_connections.get(
            agent_id
        )

        if old_connection:
            try:
                await old_connection.close(
                    code=1000
                )
            except Exception:
                pass

        self.active_connections[
            agent_id
        ] = websocket

        print(
            f"Desktop Agent {agent_id} connected"
        )

    def disconnect(
        self,
        agent_id: str
    ):
        if agent_id in self.active_connections:
            del self.active_connections[
                agent_id
            ]

            print(
                f"Desktop Agent {agent_id} disconnected"
            )

    def is_online(
        self,
        agent_id: str
    ) -> bool:

        return agent_id in self.active_connections

    async def send_to_agent(
        self,
        agent_id: str,
        message: dict
    ) -> bool:

        websocket = self.active_connections.get(
            agent_id
        )

        if not websocket:
            return False

        try:
            await websocket.send_json(
                message
            )

            return True

        except Exception as e:

            print(
                f"Failed to send command to agent {agent_id}: {e}"
            )

            self.disconnect(
                agent_id
            )

            return False


agent_manager = AgentConnectionManager()


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

    if not agent_token:

        await websocket.close(
            code=1008,
            reason="Agent token is required"
        )

        return

    try:

        agent = await authenticate_agent(
            agent_id,
            agent_token
        )

    except Exception:

        await websocket.close(
            code=1008,
            reason="Invalid agent credentials"
        )

        return

    if not agent:

        await websocket.close(
            code=1008,
            reason="Invalid agent credentials"
        )

        return

    remote_id = agent.get(
        "remote_id"
    )

    if not remote_id:

        await websocket.close(
            code=1008,
            reason="Agent owner not found"
        )

        return

    await agent_manager.connect(
        agent_id,
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
                ),
                "status": "connected"
            }
        }
    )

    try:

        await websocket.send_json({
            "type": "agent_connected",
            "agent_id": agent_id,
            "remote_id": remote_id,
            "status": "connected"
        })

        while True:

            data = await websocket.receive_json()

            message_type = data.get(
                "type"
            )

            if message_type == "agent_status":

                agent_status = data.get(
                    "status",
                    "connected"
                )

                await agents_collection.update_one(
                    {
                        "agent_id": agent_id
                    },
                    {
                        "$set": {
                            "agent_status": agent_status,
                            "last_connected_at": datetime.now(
                                timezone.utc
                            )
                        }
                    }
                )

                await websocket.send_json({
                    "type": "agent_status",
                    "status": agent_status,
                    "agent_id": agent_id
                })

                continue

            if message_type == "heartbeat":

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

                await websocket.send_json({
                    "type": "heartbeat_ack",
                    "agent_id": agent_id,
                    "status": "ok"
                })

                continue

            if message_type == "command_result":

                session_id = data.get(
                    "session_id"
                )

                feature = data.get(
                    "feature"
                )

                success = data.get(
                    "success",
                    False
                )

                message = data.get(
                    "message",
                    ""
                )

                if not session_id:

                    await websocket.send_json({
                        "type": "error",
                        "message": "session_id is required"
                    })

                    continue

                session = await sessions_collection.find_one({
                    "session_id": session_id
                })

                if not session:

                    await websocket.send_json({
                        "type": "error",
                        "message": "Session not found"
                    })

                    continue

                if session.get(
                    "status"
                ) != "active":

                    await websocket.send_json({
                        "type": "error",
                        "message": "Session is not active"
                    })

                    continue

                if remote_id not in {
                    session.get(
                        "user_a_remote_id"
                    ),
                    session.get(
                        "user_b_remote_id"
                    )
                }:

                    await websocket.send_json({
                        "type": "error",
                        "message": "Agent is not part of this session"
                    })

                    continue

                target_remote_id = (
                    session.get(
                        "user_b_remote_id"
                    )
                    if session.get(
                        "user_a_remote_id"
                    ) == remote_id
                    else session.get(
                        "user_a_remote_id"
                    )
                )

                result_message = {
                    "type": "command_result",
                    "session_id": session_id,
                    "feature": feature,
                    "success": success,
                    "message": message,
                    "agent_id": agent_id,
                    "remote_id": remote_id,
                    "timestamp": datetime.now(
                        timezone.utc
                    ).isoformat()
                }

                from app.websocket.connection_manager import manager

                sent = await manager.send_to_user(
                    target_remote_id,
                    result_message
                )

                await websocket.send_json({
                    "type": "command_result_ack",
                    "session_id": session_id,
                    "feature": feature,
                    "success": success,
                    "forwarded": sent
                })

                continue

            await websocket.send_json({
                "type": "error",
                "message": "Unknown agent message"
            })

    except WebSocketDisconnect:

        agent_manager.disconnect(
            agent_id
        )

        await agents_collection.update_one(
            {
                "agent_id": agent_id
            },
            {
                "$set": {
                    "status": "registered"
                }
            }
        )

    except Exception as e:

        print(
            f"Agent WebSocket error: {e}"
        )

        agent_manager.disconnect(
            agent_id
        )

        await agents_collection.update_one(
            {
                "agent_id": agent_id
            },
            {
                "$set": {
                    "status": "registered"
                }
            }
        )