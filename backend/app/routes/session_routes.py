from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone

from app.middleware.auth_middleware import get_current_user
from app.database.mongodb import sessions_collection
from app.models.session import SessionCreate, SessionResponse
from app.websocket.connection_manager import manager


router = APIRouter(
    prefix="/session",
    tags=["Session"]
)


DEFAULT_PERMISSIONS = {
    "video": False,
    "voice": False,
    "screen": False,
    "chat": False,
    "mouse": False,
    "keyboard": False,
    "file_transfer": False,
    "translation": False
}


def is_session_participant(
    session: dict,
    remote_id: str
) -> bool:

    return remote_id in {
        session.get("user_a_remote_id"),
        session.get("user_b_remote_id")
    }


def get_other_user_remote_id(
    session: dict,
    current_remote_id: str
) -> str:

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


@router.post(
    "/create",
    response_model=SessionResponse
)
async def create_session(
    data: SessionCreate,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    if data.user_b_remote_id == current_remote_id:

        raise HTTPException(
            status_code=400,
            detail="You cannot create a session with yourself"
        )

    existing_session = await sessions_collection.find_one({
        "$or": [
            {
                "user_a_remote_id": current_remote_id,
                "user_b_remote_id": data.user_b_remote_id,
                "status": "active"
            },
            {
                "user_a_remote_id": data.user_b_remote_id,
                "user_b_remote_id": current_remote_id,
                "status": "active"
            }
        ]
    })

    if existing_session:

        raise HTTPException(
            status_code=400,
            detail="Active session already exists"
        )

    import uuid

    session_id = (
        "SES-" +
        uuid.uuid4().hex[:12].upper()
    )

    created_at = datetime.now(
        timezone.utc
    )

    session_doc = {
        "session_id": session_id,
        "user_a_remote_id": current_remote_id,
        "user_b_remote_id": data.user_b_remote_id,
        "status": "active",
        "permissions": DEFAULT_PERMISSIONS.copy(),
        "permission_requests": {},
        "created_at": created_at,
        "ended_at": None
    }

    await sessions_collection.insert_one(
        session_doc
    )

    await manager.send_to_user(
        data.user_b_remote_id,
        {
            "type": "session_created",
            "session_id": session_id,
            "user_a_remote_id": current_remote_id,
            "user_b_remote_id": data.user_b_remote_id,
            "status": "active",
            "permissions": DEFAULT_PERMISSIONS.copy()
        }
    )

    return {
        "session_id": session_id,
        "user_a_remote_id": current_remote_id,
        "user_b_remote_id": data.user_b_remote_id,
        "status": "active",
        "permissions": DEFAULT_PERMISSIONS.copy(),
        "created_at": created_at
    }


@router.get(
    "/{session_id}",
    response_model=SessionResponse
)
async def get_session(
    session_id: str,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    if not session:

        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    if not is_session_participant(
        session,
        current_remote_id
    ):

        raise HTTPException(
            status_code=403,
            detail="You are not part of this session"
        )

    return {
        "session_id": session[
            "session_id"
        ],
        "user_a_remote_id": session[
            "user_a_remote_id"
        ],
        "user_b_remote_id": session[
            "user_b_remote_id"
        ],
        "status": session.get(
            "status"
        ),
        "permissions": session.get(
            "permissions",
            DEFAULT_PERMISSIONS.copy()
        ),
        "created_at": session.get(
            "created_at"
        )
    }


@router.get("/")
async def get_my_sessions(
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    cursor = sessions_collection.find({
        "$or": [
            {
                "user_a_remote_id": current_remote_id
            },
            {
                "user_b_remote_id": current_remote_id
            }
        ]
    }).sort(
        "created_at",
        -1
    )

    sessions = []

    async for session in cursor:

        sessions.append({
            "session_id": session.get(
                "session_id"
            ),
            "user_a_remote_id": session.get(
                "user_a_remote_id"
            ),
            "user_b_remote_id": session.get(
                "user_b_remote_id"
            ),
            "status": session.get(
                "status"
            ),
            "permissions": session.get(
                "permissions",
                DEFAULT_PERMISSIONS.copy()
            ),
            "created_at": session.get(
                "created_at"
            ),
            "ended_at": session.get(
                "ended_at"
            )
        })

    return {
        "sessions": sessions
    }


@router.post(
    "/{session_id}/end"
)
async def end_session(
    session_id: str,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    if not session:

        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    if not is_session_participant(
        session,
        current_remote_id
    ):

        raise HTTPException(
            status_code=403,
            detail="You are not part of this session"
        )

    if session.get(
        "status"
    ) == "ended":

        return {
            "message": "Session already ended",
            "session_id": session_id,
            "status": "ended"
        }

    ended_at = datetime.now(
        timezone.utc
    )

    await sessions_collection.update_one(
        {
            "session_id": session_id,
            "status": "active"
        },
        {
            "$set": {
                "status": "ended",
                "ended_at": ended_at,
                "permissions": DEFAULT_PERMISSIONS.copy(),
                "permission_requests": {}
            }
        }
    )

    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    session_ended_message = {
        "type": "session_ended",
        "session_id": session_id,
        "ended_by": current_remote_id,
        "status": "ended",
        "permissions": DEFAULT_PERMISSIONS.copy(),
        "ended_at": ended_at.isoformat()
    }

    await manager.send_to_user(
        current_remote_id,
        session_ended_message
    )

    await manager.send_to_user(
        other_remote_id,
        session_ended_message
    )

    return {
        "message": "Session ended successfully",
        "session_id": session_id,
        "status": "ended",
        "ended_at": ended_at
    }