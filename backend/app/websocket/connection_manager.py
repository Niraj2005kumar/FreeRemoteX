from fastapi import WebSocket
from typing import Dict


class ConnectionManager:

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(
        self,
        remote_id: str,
        websocket: WebSocket
    ):
        await websocket.accept()

        old_connection = self.active_connections.get(
            remote_id
        )

        if old_connection:
            try:
                await old_connection.close(
                    code=1000
                )
            except Exception:
                pass

        self.active_connections[
            remote_id
        ] = websocket

        print(
            f"User {remote_id} connected via WebSocket"
        )

    def disconnect(
        self,
        remote_id: str
    ):
        if remote_id in self.active_connections:
            del self.active_connections[
                remote_id
            ]

            print(
                f"User {remote_id} disconnected"
            )

    def is_online(
        self,
        remote_id: str
    ) -> bool:
        return remote_id in self.active_connections

    async def send_to_user(
        self,
        remote_id: str,
        message: dict
    ) -> bool:

        websocket = self.active_connections.get(
            remote_id
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
                f"Failed to send message to {remote_id}: {e}"
            )

            self.disconnect(
                remote_id
            )

            return False

    async def broadcast(
        self,
        message: dict,
        exclude_remote_id: str | None = None
    ):

        disconnected_users = []

        for remote_id, websocket in list(
            self.active_connections.items()
        ):

            if remote_id == exclude_remote_id:
                continue

            try:

                await websocket.send_json(
                    message
                )

            except Exception as e:

                print(
                    f"Failed to send message to {remote_id}: {e}"
                )

                disconnected_users.append(
                    remote_id
                )

        for remote_id in disconnected_users:

            self.disconnect(
                remote_id
            )


manager = ConnectionManager()