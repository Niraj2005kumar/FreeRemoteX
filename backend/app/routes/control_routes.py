from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth_middleware import get_current_user
from app.models.control import (
    MouseCommand,
    KeyboardCommand
)
from app.services.control_service import (
    check_control_permission
)
from app.database.mongodb import (
    sessions_collection,
    desktop_agents_collection
)
from app.websocket.agent import agent_manager


router = APIRouter(
    prefix="/control",
    tags=["Remote Control"]
)


async def get_session(
    session_id: str,
    remote_id: str
):
    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    if remote_id not in {
        session.get("user_a_remote_id"),
        session.get("user_b_remote_id")
    }:
        raise HTTPException(
            status_code=403,
            detail="You are not part of this session"
        )

    if session.get("status") != "active":
        raise HTTPException(
            status_code=400,
            detail="Session is not active"
        )

    return session


async def get_connected_agent(
    remote_id: str
):
    agent = await desktop_agents_collection.find_one({
        "remote_id": remote_id,
        "status": "connected"
    })

    if not agent:
        raise HTTPException(
            status_code=404,
            detail="Remote Desktop Agent is not connected"
        )

    agent_id = agent.get(
        "agent_id"
    )

    if not agent_id:
        raise HTTPException(
            status_code=404,
            detail="Desktop Agent ID not found"
        )

    if not agent_manager.is_online(
        agent_id
    ):
        raise HTTPException(
            status_code=404,
            detail="Desktop Agent is offline"
        )

    return agent


@router.post("/mouse")
async def mouse_control(
    data: MouseCommand,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    session = await get_session(
        data.session_id,
        current_remote_id
    )

    await check_control_permission(
        session_id=data.session_id,
        remote_id=current_remote_id,
        feature="mouse"
    )

    target_remote_id = (
        session.get("user_b_remote_id")
        if session.get("user_a_remote_id")
        == current_remote_id
        else session.get("user_a_remote_id")
    )

    valid_actions = {
        "move",
        "click",
        "double_click",
        "right_click",
        "mousedown",
        "mouseup",
        "scroll"
    }

    if data.action not in valid_actions:
        raise HTTPException(
            status_code=400,
            detail="Invalid mouse action"
        )

    agent = await get_connected_agent(
        target_remote_id
    )

    command = {
        "type": "mouse",
        "session_id": data.session_id,
        "action": data.action,
        "x": data.x,
        "y": data.y,
        "button": data.button
    }

    sent = await agent_manager.send_to_agent(
        agent["agent_id"],
        {
            "type": "remote_control",
            "feature": "mouse",
            "session_id": data.session_id,
            "command": command
        }
    )

    if not sent:
        raise HTTPException(
            status_code=503,
            detail="Desktop Agent is no longer connected"
        )

    return {
        "message": "Mouse command sent",
        "session_id": data.session_id,
        "feature": "mouse",
        "action": data.action
    }


@router.post("/keyboard")
async def keyboard_control(
    data: KeyboardCommand,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    session = await get_session(
        data.session_id,
        current_remote_id
    )

    await check_control_permission(
        session_id=data.session_id,
        remote_id=current_remote_id,
        feature="keyboard"
    )

    target_remote_id = (
        session.get("user_b_remote_id")
        if session.get("user_a_remote_id")
        == current_remote_id
        else session.get("user_a_remote_id")
    )

    valid_actions = {
        "keydown",
        "keyup",
        "press"
    }

    if data.action not in valid_actions:
        raise HTTPException(
            status_code=400,
            detail="Invalid keyboard action"
        )

    agent = await get_connected_agent(
        target_remote_id
    )

    command = {
        "type": "keyboard",
        "session_id": data.session_id,
        "action": data.action,
        "key": data.key
    }

    sent = await agent_manager.send_to_agent(
        agent["agent_id"],
        {
            "type": "remote_control",
            "feature": "keyboard",
            "session_id": data.session_id,
            "command": command
        }
    )

    if not sent:
        raise HTTPException(
            status_code=503,
            detail="Desktop Agent is no longer connected"
        )

    return {
        "message": "Keyboard command sent",
        "session_id": data.session_id,
        "feature": "keyboard",
        "action": data.action
    }