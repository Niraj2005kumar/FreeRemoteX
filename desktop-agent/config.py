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

    @property
    def websocket_url(self):

        return (
            f"{self.server_url}/ws/agent/"
            f"{self.agent_id}?token={self.token}"
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

            except Exception as e:

                print(
                    f"Connection lost: {e}"
                )

                self.websocket = None

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

        if message_type == "remote_control":

            await self.handle_remote_control(
                data
            )

            return

        if message_type == "command_result_ack":

            return

        print(
            f"Received: {data}"
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

        try:

            if feature == "mouse":

                execute_mouse_command(
                    command
                )

            elif feature == "keyboard":

                execute_keyboard_command(
                    command
                )

            else:

                await self.send_command_result(
                    session_id,
                    feature,
                    False,
                    "Unsupported control feature"
                )

                return

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
                    "type": "command_result",
                    "session_id": session_id,
                    "feature": feature,
                    "success": success,
                    "message": message
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