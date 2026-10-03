from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.middleware.auth_middleware import get_current_user
from app.database.mongodb import sessions_collection
from app.websocket.connection_manager import manager
from app.services.control_service import check_control_permission


router = APIRouter(
    prefix="/control",
    tags=["Remote Control"]
)


class MouseCommand(BaseModel):
    session_id: str
    action: str
    x: float = Field(..., ge=0)
    y: float = Field(..., ge=0)
    button: str | None = None


class KeyboardCommand(BaseModel):
    session_id: str
    action: str
    key: str = Field(..., min_length=1, max_length=100)


def get_other_user_remote_id(
    session: dict,
    current_remote_id: str
):

    if session.get(
        "user_a_remote_id"
    ) == current_remote_id:

        return session.get(
            "user_b_remote_id"
        )

    if session.get(
        "user_b_remote_id"
    ) == current_remote_id:

        return session.get(
            "user_a_remote_id"
        )

    raise HTTPException(
        status_code=403,
        detail="You are not part of this session"
    )


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

    await check_control_permission(
        session_id=data.session_id,
        remote_id=current_remote_id,
        feature="mouse"
    )

    session = await sessions_collection.find_one({
        "session_id": data.session_id
    })

    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    allowed_actions = {
        "move",
        "click",
        "double_click",
        "right_click",
        "mousedown",
        "mouseup",
        "scroll"
    }

    if data.action not in allowed_actions:
        raise HTTPException(
            status_code=400,
            detail="Invalid mouse action"
        )

    await manager.send_to_user(
        other_remote_id,
        {
            "type": "mouse_control",
            "session_id": data.session_id,
            "from_remote_id": current_remote_id,
            "action": data.action,
            "x": data.x,
            "y": data.y,
            "button": data.button
        }
    )

    return {
        "message": "Mouse command sent",
        "session_id": data.session_id,
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

    await check_control_permission(
        session_id=data.session_id,
        remote_id=current_remote_id,
        feature="keyboard"
    )

    session = await sessions_collection.find_one({
        "session_id": data.session_id
    })

    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    allowed_actions = {
        "keydown",
        "keyup",
        "press"
    }

    if data.action not in allowed_actions:
        raise HTTPException(
            status_code=400,
            detail="Invalid keyboard action"
        )

    await manager.send_to_user(
        other_remote_id,
        {
            "type": "keyboard_control",
            "session_id": data.session_id,
            "from_remote_id": current_remote_id,
            "action": data.action,
            "key": data.key
        }
    )

    return {
        "message": "Keyboard command sent",
        "session_id": data.session_id,
        "action": data.action,
        "key": data.key
    }