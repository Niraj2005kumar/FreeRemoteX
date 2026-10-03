import hashlib

from app.database.mongodb import desktop_agents_collection


def hash_agent_token(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


async def authenticate_agent(
    agent_id: str,
    token: str
):
    if not agent_id or not token:
        return None

    token_hash = hash_agent_token(token)

    agent = await desktop_agents_collection.find_one({
        "agent_id": agent_id,
        "token_hash": token_hash,
        "status": "registered"
    })

    return agent