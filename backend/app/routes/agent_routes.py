from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import secrets
import hashlib

from app.middleware.auth_middleware import get_current_user
from app.database.mongodb import database
from app.models.agent import AgentRegisterRequest


router = APIRouter(
    prefix="/agent",
    tags=["Desktop Agent"]
)


agents_collection = database["desktop_agents"]


def generate_agent_token():
    return secrets.token_urlsafe(48)


def hash_agent_token(token: str):
    return hashlib.sha256(
        token.encode()
    ).hexdigest()


@router.post("/register")
async def register_agent(
    data: AgentRegisterRequest,
    current_user: dict = Depends(
        get_current_user
    )
):

    remote_id = current_user["remote_id"]

    existing_agent = await agents_collection.find_one({
        "remote_id": remote_id,
        "device_name": data.device_name
    })

    if existing_agent:
        raise HTTPException(
            status_code=400,
            detail="Agent with this device name already exists"
        )

    agent_id = secrets.token_hex(16)

    agent_token = generate_agent_token()
    token_hash = hash_agent_token(
        agent_token
    )

    agent_doc = {
        "agent_id": agent_id,
        "remote_id": remote_id,
        "device_name": data.device_name,
        "token_hash": token_hash,
        "status": "registered",
        "created_at": datetime.now(
            timezone.utc
        ),
        "last_connected_at": None
    }

    await agents_collection.insert_one(
        agent_doc
    )

    return {
        "message": "Desktop agent registered successfully",
        "agent_id": agent_id,
        "device_name": data.device_name,
        "agent_token": agent_token,
        "status": "registered"
    }


@router.get("/list")
async def list_agents(
    current_user: dict = Depends(
        get_current_user
    )
):

    remote_id = current_user["remote_id"]

    cursor = agents_collection.find({
        "remote_id": remote_id
    })

    agents = []

    async for agent in cursor:

        agents.append({
            "agent_id": agent.get(
                "agent_id"
            ),
            "device_name": agent.get(
                "device_name"
            ),
            "status": agent.get(
                "status"
            ),
            "created_at": agent.get(
                "created_at"
            ).isoformat()
            if agent.get("created_at")
            else None,
            "last_connected_at": agent.get(
                "last_connected_at"
            ).isoformat()
            if agent.get("last_connected_at")
            else None
        })

    return {
        "agents": agents
    }


@router.delete("/{agent_id}")
async def revoke_agent(
    agent_id: str,
    current_user: dict = Depends(
        get_current_user
    )
):

    remote_id = current_user["remote_id"]

    agent = await agents_collection.find_one({
        "agent_id": agent_id,
        "remote_id": remote_id
    })

    if not agent:
        raise HTTPException(
            status_code=404,
            detail="Agent not found"
        )

    await agents_collection.update_one(
        {
            "agent_id": agent_id,
            "remote_id": remote_id
        },
        {
            "$set": {
                "status": "revoked",
                "revoked_at": datetime.now(
                    timezone.utc
                )
            }
        }
    )

    return {
        "message": "Desktop agent revoked successfully",
        "agent_id": agent_id
    }