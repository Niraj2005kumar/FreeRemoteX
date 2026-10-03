import os

from dotenv import load_dotenv


load_dotenv()


BACKEND_URL = os.getenv(
    "REMOTEX_BACKEND_URL",
    "ws://localhost:8000"
).rstrip("/")


AGENT_ID = os.getenv(
    "REMOTEX_AGENT_ID",
    ""
)


AGENT_TOKEN = os.getenv(
    "REMOTEX_AGENT_TOKEN",
    ""
)


HEARTBEAT_INTERVAL = int(
    os.getenv(
        "REMOTEX_HEARTBEAT_INTERVAL",
        "15"
    )
)


RECONNECT_DELAY = int(
    os.getenv(
        "REMOTEX_RECONNECT_DELAY",
        "5"
    )
)