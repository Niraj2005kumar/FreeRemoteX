from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth_middleware import get_current_user
from app.models.permission import (
    PermissionRequest,
    PermissionResponse,
    VALID_FEATURES
)
from app.websocket.connection_manager import manager
from app.database.mongodb import sessions_collection


router = APIRouter(
    prefix="/permission",
    tags=["Permission"]
)


WEBRTC_FEATURES = {
    "video",
    "voice",
    "screen"
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


async def get_valid_session(
    session_id: str,
    current_remote_id: str
):

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    if current_remote_id not in {
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


@router.post("/request")
async def request_permission(
    data: PermissionRequest,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    if data.feature not in VALID_FEATURES:
        raise HTTPException(
            status_code=400,
            detail="Invalid feature name"
        )

    session = await get_valid_session(
        data.session_id,
        current_remote_id
    )

    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    permissions = session.get(
        "permissions",
        {}
    )

    if permissions.get(
        data.feature
    ) is True:

        raise HTTPException(
            status_code=400,
            detail=f"Permission for '{data.feature}' is already granted"
        )

    permission_requests = session.get(
        "permission_requests",
        {}
    )

    existing_request = permission_requests.get(
        data.feature
    )

    if (
        existing_request
        and existing_request.get("status") == "pending"
    ):

        raise HTTPException(
            status_code=400,
            detail=f"Permission request for '{data.feature}' is already pending"
        )

    await sessions_collection.update_one(
        {
            "session_id": data.session_id
        },
        {
            "$set": {
                f"permission_requests.{data.feature}": {
                    "status": "pending",
                    "requested_by": current_remote_id,
                    "requested_from": other_remote_id
                }
            }
        }
    )

    await manager.send_to_user(
        other_remote_id,
        {
            "type": "permission_request",
            "session_id": data.session_id,
            "feature": data.feature,
            "from_remote_id": current_remote_id
        }
    )

    return {
        "message": f"Permission request for '{data.feature}' sent",
        "session_id": data.session_id,
        "feature": data.feature,
        "status": "pending"
    }


@router.post("/respond")
async def respond_permission(
    data: PermissionResponse,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    if data.feature not in VALID_FEATURES:
        raise HTTPException(
            status_code=400,
            detail="Invalid feature name"
        )

    session = await get_valid_session(
        data.session_id,
        current_remote_id
    )

    permission_requests = session.get(
        "permission_requests",
        {}
    )

    request_data = permission_requests.get(
        data.feature
    )

    if not request_data:
        raise HTTPException(
            status_code=400,
            detail="No permission request found"
        )

    if request_data.get(
        "status"
    ) != "pending":

        raise HTTPException(
            status_code=400,
            detail="Permission request is not pending"
        )

    if request_data.get(
        "requested_from"
    ) != current_remote_id:

        raise HTTPException(
            status_code=403,
            detail="Only the requested user can respond"
        )

    requested_by = request_data.get(
        "requested_by"
    )

    await sessions_collection.update_one(
        {
            "session_id": data.session_id
        },
        {
            "$set": {
                f"permissions.{data.feature}":
                    data.approved,
                f"permission_requests.{data.feature}": {
                    "status": (
                        "approved"
                        if data.approved
                        else "rejected"
                    ),
                    "requested_by": requested_by,
                    "requested_from": current_remote_id,
                    "approved_by": current_remote_id
                }
            }
        }
    )

    await manager.send_to_user(
        requested_by,
        {
            "type": "permission_response",
            "session_id": data.session_id,
            "feature": data.feature,
            "approved": data.approved,
            "responded_by": current_remote_id
        }
    )

    return {
        "message": (
            f"Permission for '{data.feature}' "
            f"{'granted' if data.approved else 'denied'}"
        ),
        "session_id": data.session_id,
        "feature": data.feature,
        "approved": data.approved
    }


@router.post("/revoke")
async def revoke_permission(
    data: PermissionRequest,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    if data.feature not in VALID_FEATURES:
        raise HTTPException(
            status_code=400,
            detail="Invalid feature name"
        )

    session = await get_valid_session(
        data.session_id,
        current_remote_id
    )

    if session.get(
        "permissions",
        {}
    ).get(data.feature) is not True:

        raise HTTPException(
            status_code=400,
            detail=f"Permission for '{data.feature}' is not currently granted"
        )

    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    await sessions_collection.update_one(
        {
            "session_id": data.session_id
        },
        {
            "$set": {
                f"permissions.{data.feature}":
                    False,
                f"permission_requests.{data.feature}": {
                    "status": "revoked",
                    "revoked_by": current_remote_id
                }
            }
        }
    )

    await manager.send_to_user(
        other_remote_id,
        {
            "type": "permission_revoked",
            "session_id": data.session_id,
            "feature": data.feature,
            "revoked_by": current_remote_id
        }
    )

    return {
        "message": f"Permission for '{data.feature}' revoked",
        "session_id": data.session_id,
        "feature": data.feature,
        "approved": False
    }


@router.get("/status/{session_id}")
async def get_permission_status(
    session_id: str,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    session = await get_valid_session(
        session_id,
        current_remote_id
    )

    return {
        "session_id": session_id,
        "permissions": session.get(
            "permissions",
            {}
        ),
        "permission_requests": session.get(
            "permission_requests",
            {}
        )
    }