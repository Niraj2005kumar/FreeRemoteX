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

    if session.get(
        "status"
    ) != "active":

        raise HTTPException(
            status_code=400,
            detail="Session is not active"
        )

    return session


def validate_feature(
    feature: str
):

    feature = feature.lower().strip()

    if feature not in VALID_FEATURES:

        raise HTTPException(
            status_code=400,
            detail=f"Invalid feature: {feature}"
        )

    return feature


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

    feature = validate_feature(
        data.feature
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
        feature
    ) is True:

        raise HTTPException(
            status_code=400,
            detail=(
                f"Permission for "
                f"'{feature}' is already granted"
            )
        )

    permission_requests = session.get(
        "permission_requests",
        {}
    )

    existing_request = permission_requests.get(
        feature
    )

    if (
        existing_request
        and existing_request.get("status") == "pending"
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                f"Permission request for "
                f"'{feature}' is already pending"
            )
        )

    request_data = {
        "status": "pending",
        "requested_by": current_remote_id,
        "requested_from": other_remote_id
    }

    result = await sessions_collection.update_one(
        {
            "session_id": data.session_id,
            "status": "active",
            f"permission_requests.{feature}.status": {
                "$ne": "pending"
            }
        },
        {
            "$set": {
                f"permission_requests.{feature}":
                    request_data
            }
        }
    )

    if result.modified_count == 0:

        raise HTTPException(
            status_code=409,
            detail=(
                f"Permission request for "
                f"'{feature}' could not be created"
            )
        )

    await manager.send_to_user(
        other_remote_id,
        {
            "type": "permission_request",
            "session_id": data.session_id,
            "feature": feature,
            "from_remote_id": current_remote_id
        }
    )

    return {
        "message": (
            f"Permission request for "
            f"'{feature}' sent"
        ),
        "session_id": data.session_id,
        "feature": feature,
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

    feature = validate_feature(
        data.feature
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
        feature
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

    approved = bool(
        data.approved
    )

    new_status = (
        "approved"
        if approved
        else "rejected"
    )

    result = await sessions_collection.update_one(
        {
            "session_id": data.session_id,
            "status": "active",
            f"permission_requests.{feature}.status":
                "pending"
        },
        {
            "$set": {
                f"permissions.{feature}":
                    approved,
                f"permission_requests.{feature}": {
                    "status": new_status,
                    "requested_by": requested_by,
                    "requested_from":
                        current_remote_id,
                    "responded_by":
                        current_remote_id
                }
            }
        }
    )

    if result.modified_count == 0:

        raise HTTPException(
            status_code=409,
            detail=(
                "Permission request was already "
                "processed or session changed"
            )
        )

    permission_message = {
        "type": "permission_response",
        "session_id": data.session_id,
        "feature": feature,
        "approved": approved,
        "responded_by": current_remote_id
    }

    await manager.send_to_user(
        requested_by,
        permission_message
    )

    update_message = {
        "type": "permission_update",
        "session_id": data.session_id,
        "feature": feature,
        "approved": approved,
        "updated_by": current_remote_id
    }

    await manager.send_to_user(
        requested_by,
        update_message
    )

    await manager.send_to_user(
        current_remote_id,
        update_message
    )

    return {
        "message": (
            f"Permission for '{feature}' "
            f"{'granted' if approved else 'denied'}"
        ),
        "session_id": data.session_id,
        "feature": feature,
        "approved": approved,
        "status": new_status
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

    feature = validate_feature(
        data.feature
    )

    session = await get_valid_session(
        data.session_id,
        current_remote_id
    )

    if session.get(
        "permissions",
        {}
    ).get(feature) is not True:

        raise HTTPException(
            status_code=400,
            detail=(
                f"Permission for '{feature}' "
                f"is not currently granted"
            )
        )

    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    result = await sessions_collection.update_one(
        {
            "session_id": data.session_id,
            "status": "active",
            f"permissions.{feature}": True
        },
        {
            "$set": {
                f"permissions.{feature}":
                    False,
                f"permission_requests.{feature}": {
                    "status": "revoked",
                    "revoked_by":
                        current_remote_id
                }
            }
        }
    )

    if result.modified_count == 0:

        raise HTTPException(
            status_code=409,
            detail=(
                f"Permission for '{feature}' "
                f"was already revoked"
            )
        )

    revoke_message = {
        "type": "permission_revoked",
        "session_id": data.session_id,
        "feature": feature,
        "revoked_by": current_remote_id
    }

    await manager.send_to_user(
        other_remote_id,
        revoke_message
    )

    await manager.send_to_user(
        current_remote_id,
        revoke_message
    )

    permission_update_message = {
        "type": "permission_update",
        "session_id": data.session_id,
        "feature": feature,
        "approved": False,
        "updated_by": current_remote_id
    }

    await manager.send_to_user(
        other_remote_id,
        permission_update_message
    )

    await manager.send_to_user(
        current_remote_id,
        permission_update_message
    )

    return {
        "message": (
            f"Permission for '{feature}' revoked"
        ),
        "session_id": data.session_id,
        "feature": feature,
        "approved": False,
        "status": "revoked"
    }


@router.get(
    "/status/{session_id}"
)
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