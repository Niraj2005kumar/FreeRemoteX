import hashlib

from fastapi import HTTPException

from app.database.mongodb import database


agents_collection = database[
    "desktop_agents"
]


def hash_agent_token(token: str):
    return hashlib.sha256(
        token.encode()
    ).hexdigest()


async def authenticate_agent(
    agent_id: str,
    agent_token: str
):

    if not agent_id or not agent_token:
        raise HTTPException(
            status_code=401,
            detail="Agent credentials required"
        )

    token_hash = hash_agent_token(
        agent_token
    )

    agent = await agents_collection.find_one({
        "agent_id": agent_id,
        "token_hash": token_hash
    })

    if not agent:
        raise HTTPException(
            status_code=401,
            detail="Invalid agent credentials"
        )

    if agent.get("status") != "registered":
        raise HTTPException(
            status_code=403,
            detail="Desktop agent is not active"
        )

    return agent