from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid

from app.middleware.auth_middleware import get_current_user
from app.database.mongodb import sessions_collection
from app.models.session import SessionCreate, SessionResponse

router = APIRouter(
    prefix="/session",
    tags=["Session"]
)


def generate_session_id():
    return "SES-" + uuid.uuid4().hex[:12].upper()


def is_session_participant(
    session: dict,
    remote_id: str
):
    return remote_id in {
        session.get("user_a_remote_id"),
        session.get("user_b_remote_id")
    }


@router.post(
    "/create",
    response_model=SessionResponse
)
async def create_session(
    data: SessionCreate,
    current_user: dict = Depends(get_current_user)
):
    if data.user_b_remote_id == current_user["remote_id"]:
        raise HTTPException(
            status_code=400,
            detail="You cannot create a session with yourself"
        )

    existing_session = await sessions_collection.find_one({
        "$or": [
            {
                "user_a_remote_id": current_user["remote_id"],
                "user_b_remote_id": data.user_b_remote_id,
                "status": "active"
            },
            {
                "user_a_remote_id": data.user_b_remote_id,
                "user_b_remote_id": current_user["remote_id"],
                "status": "active"
            }
        ]
    })

    if existing_session:
        raise HTTPException(
            status_code=400,
            detail="Active session already exists"
        )

    session_id = generate_session_id()

    session = {
        "session_id": session_id,
        "user_a_remote_id": current_user["remote_id"],
        "user_b_remote_id": data.user_b_remote_id,
        "status": "active",
        "permissions": {
            "video": False,
            "voice": False,
            "screen": False,
            "chat": False,
            "mouse": False,
            "keyboard": False,
            "file_transfer": False,
            "translation": False
        },
        "permission_requests": {},
        "created_at": datetime.now(timezone.utc),
        "ended_at": None
    }

    await sessions_collection.insert_one(session)

    return {
        "session_id": session_id,
        "user_a_remote_id": session["user_a_remote_id"],
        "user_b_remote_id": session["user_b_remote_id"],
        "status": session["status"],
        "permissions": session["permissions"],
        "created_at": session["created_at"]
    }


@router.get(
    "/{session_id}",
    response_model=SessionResponse
)
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
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
        current_user["remote_id"]
    ):
        raise HTTPException(
            status_code=403,
            detail="You are not part of this session"
        )

    return {
        "session_id": session["session_id"],
        "user_a_remote_id": session["user_a_remote_id"],
        "user_b_remote_id": session["user_b_remote_id"],
        "status": session["status"],
        "permissions": session.get(
            "permissions",
            {}
        ),
        "created_at": session.get(
            "created_at"
        )
    }


@router.get("/")
async def get_my_sessions(
    current_user: dict = Depends(get_current_user)
):
    sessions = await sessions_collection.find({
        "$or": [
            {
                "user_a_remote_id":
                    current_user["remote_id"]
            },
            {
                "user_b_remote_id":
                    current_user["remote_id"]
            }
        ]
    }).sort(
        "created_at",
        -1
    ).to_list(
        length=100
    )

    result = []

    for session in sessions:
        result.append({
            "session_id": session["session_id"],
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
                {}
            ),
            "created_at": session.get(
                "created_at"
            ),
            "ended_at": session.get(
                "ended_at"
            )
        })

    return {
        "sessions": result
    }


@router.post(
    "/{session_id}/end"
)
async def end_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
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
        current_user["remote_id"]
    ):
        raise HTTPException(
            status_code=403,
            detail="You are not part of this session"
        )

    if session.get("status") == "ended":
        return {
            "message": "Session already ended",
            "session_id": session_id
        }

    await sessions_collection.update_one(
        {
            "session_id": session_id
        },
        {
            "$set": {
                "status": "ended",
                "ended_at": datetime.now(
                    timezone.utc
                )
            }
        }
    )

    return {
        "message": "Session ended successfully",
        "session_id": session_id
    }