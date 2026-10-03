import asyncio
import json

import websockets

from config import (
    BACKEND_URL,
    AGENT_ID,
    AGENT_TOKEN,
    HEARTBEAT_INTERVAL,
    RECONNECT_DELAY
)

from control import (
    execute_mouse_command,
    execute_keyboard_command
)


class RemoteXAgent:

    def __init__(
        self,
        server_url: str,
        agent_id: str,
        token: str
    ):
        self.server_url = server_url.rstrip("/")
        self.agent_id = agent_id
        self.token = token
        self.websocket = None
        self.running = True
        self.active_permissions = {}

    @property
    def websocket_url(self):

        return (
            f"{self.server_url}"
            f"/ws/agent/{self.agent_id}"
            f"?token={self.token}"
        )

    async def connect(self):

        while self.running:

            try:

                print(
                    "Connecting to RemoteX backend..."
                )

                async with websockets.connect(
                    self.websocket_url,
                    ping_interval=20,
                    ping_timeout=20
                ) as websocket:

                    self.websocket = websocket

                    self.active_permissions = {}

                    print(
                        "RemoteX Desktop Agent connected."
                    )

                    heartbeat_task = asyncio.create_task(
                        self.heartbeat()
                    )

                    try:

                        while self.running:

                            message = await websocket.recv()

                            data = json.loads(
                                message
                            )

                            await self.handle_message(
                                data
                            )

                    finally:

                        heartbeat_task.cancel()
                        self.active_permissions = {}

            except Exception as e:

                print(
                    f"Connection lost: {e}"
                )

                self.websocket = None
                self.active_permissions = {}

            if self.running:

                print(
                    f"Reconnecting in "
                    f"{RECONNECT_DELAY} seconds..."
                )

                await asyncio.sleep(
                    RECONNECT_DELAY
                )

    async def heartbeat(self):

        while self.running:

            try:

                await asyncio.sleep(
                    HEARTBEAT_INTERVAL
                )

                if self.websocket:

                    await self.websocket.send(
                        json.dumps({
                            "type": "heartbeat"
                        })
                    )

            except asyncio.CancelledError:

                break

            except Exception:

                break

    async def handle_message(
        self,
        data: dict
    ):

        message_type = data.get(
            "type"
        )

        if message_type == "agent_connected":

            print(
                "Agent authentication successful."
            )

            print(
                f"Remote ID: "
                f"{data.get('remote_id')}"
            )

            return

        if message_type == "heartbeat_ack":

            return

        if message_type == "agent_status":

            print(
                f"Agent status: "
                f"{data.get('status')}"
            )

            return

        if message_type == "permission_update":

            session_id = data.get(
                "session_id"
            )

            feature = data.get(
                "feature"
            )

            approved = bool(
                data.get("approved")
            )

            if session_id and feature:

                if session_id not in self.active_permissions:

                    self.active_permissions[
                        session_id
                    ] = {}

                self.active_permissions[
                    session_id
                ][feature] = approved

            return

        if message_type == "permission_revoked":

            session_id = data.get(
                "session_id"
            )

            feature = data.get(
                "feature"
            )

            if session_id in self.active_permissions:

                self.active_permissions[
                    session_id
                ][feature] = False

            return

        if message_type == "session_ended":

            session_id = data.get(
                "session_id"
            )

            self.active_permissions.pop(
                session_id,
                None
            )

            return

        if message_type == "remote_control":

            await self.handle_remote_control(
                data
            )

            return

        if message_type == "command_result_ack":

            return

        if message_type == "remote_control_ack":

            return

        print(
            f"Received: {data}"
        )

    def has_permission(
        self,
        session_id: str,
        feature: str
    ) -> bool:

        return (
            self.active_permissions
            .get(session_id, {})
            .get(feature, False)
            is True
        )

    async def handle_remote_control(
        self,
        data: dict
    ):

        feature = data.get(
            "feature"
        )

        command = data.get(
            "command",
            {}
        )

        session_id = data.get(
            "session_id"
        )

        if not session_id:

            return

        if feature not in {
            "mouse",
            "keyboard"
        }:

            await self.send_command_result(
                session_id,
                feature,
                False,
                "Unsupported control feature"
            )

            return

        if not self.has_permission(
            session_id,
            feature
        ):

            await self.send_command_result(
                session_id,
                feature,
                False,
                f"Permission for '{feature}' is not approved"
            )

            return

        try:

            if feature == "mouse":

                execute_mouse_command(
                    command
                )

            elif feature == "keyboard":

                execute_keyboard_command(
                    command
                )

            await self.send_command_result(
                session_id,
                feature,
                True,
                "Command executed successfully"
            )

        except Exception as e:

            await self.send_command_result(
                session_id,
                feature,
                False,
                str(e)
            )

    async def send_command_result(
        self,
        session_id: str,
        feature: str,
        success: bool,
        message: str
    ):

        if not self.websocket:

            return

        try:

            await self.websocket.send(
                json.dumps({
                    "type":
                        "command_result",
                    "session_id":
                        session_id,
                    "feature":
                        feature,
                    "success":
                        success,
                    "message":
                        message
                })
            )

        except Exception:

            pass


async def main():

    if not AGENT_ID:

        print(
            "REMOTEX_AGENT_ID is missing in .env"
        )

        return

    if not AGENT_TOKEN:

        print(
            "REMOTEX_AGENT_TOKEN is missing in .env"
        )

        return

    agent = RemoteXAgent(
        BACKEND_URL,
        AGENT_ID,
        AGENT_TOKEN
    )

    await agent.connect()


if __name__ == "__main__":

    try:

        asyncio.run(
            main()
        )

    except KeyboardInterrupt:

        print(
            "\nRemoteX Desktop Agent stopped."
        )