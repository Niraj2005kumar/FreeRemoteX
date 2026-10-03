from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth_middleware import get_current_user

from app.models.permission import (
    PermissionRequest,
    PermissionResponse,
    VALID_FEATURES,
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

    user_a = session.get("user_a_remote_id")
    user_b = session.get("user_b_remote_id")

    if current_remote_id == user_a:
        return user_b

    if current_remote_id == user_b:
        return user_a

    raise HTTPException(
        status_code=403,
        detail="You are not a participant of this session"
    )





@router.post("/request")
async def request_permission(
    data: PermissionRequest,
    current_user: dict = Depends(get_current_user)
):

    feature = data.feature.lower().strip()

    # Validate feature
    if feature not in VALID_FEATURES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid feature name. Valid features: {sorted(VALID_FEATURES)}"
        )

    # Find session
    session = await sessions_collection.find_one(
        {
            "session_id": data.session_id
        }
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    current_remote_id = current_user["remote_id"]

    # Make sure current user belongs to session
    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    # Session must be active
    if session.get("status") != "active":
        raise HTTPException(
            status_code=400,
            detail="Session is not active"
        )

    # Get permissions
    permissions = session.get(
        "permissions",
        {}
    )

    # Already active
    if permissions.get(feature) is True:

        raise HTTPException(
            status_code=409,
            detail=f"Permission '{feature}' is already active"
        )




    await sessions_collection.update_one(
        {
            "session_id": data.session_id
        },
        {
            "$set": {
                f"permission_requests.{feature}": {
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
            "feature": feature,
            "from_remote_id": current_remote_id
        }
    )

    return {
        "message": f"Permission request for '{feature}' sent",
        "session_id": data.session_id,
        "feature": feature,
        "status": "pending"
    }





@router.post("/respond")
async def respond_permission(
    data: PermissionResponse,
    current_user: dict = Depends(get_current_user)
):

    feature = data.feature.lower().strip()

    # Validate feature
    if feature not in VALID_FEATURES:
        raise HTTPException(
            status_code=400,
            detail="Invalid feature name"
        )

    # Find session
    session = await sessions_collection.find_one(
        {
            "session_id": data.session_id
        }
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    current_remote_id = current_user["remote_id"]

    # Check participant
    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    if session.get("status") != "active":
        raise HTTPException(
            status_code=400,
            detail="Session is not active"
        )





    permission_requests = session.get(
        "permission_requests",
        {}
    )

    pending_request = permission_requests.get(
        feature
    )

    if not pending_request:
        raise HTTPException(
            status_code=404,
            detail="No permission request found"
        )

    if pending_request.get("status") != "pending":
        raise HTTPException(
            status_code=400,
            detail="Permission request is not pending"
        )




    if pending_request.get(
        "requested_from"
    ) != current_remote_id:

        raise HTTPException(
            status_code=403,
            detail="You are not allowed to respond to this request"
        )




    await sessions_collection.update_one(
        {
            "session_id": data.session_id
        },
        {
            "$set": {
                f"permissions.{feature}": data.approved,

                f"permission_requests.{feature}.status":
                    "accepted" if data.approved else "rejected",

                f"permission_requests.{feature}.responded_by":
                    current_remote_id
            }
        }
    )





    requester_remote_id = pending_request[
        "requested_by"
    ]

    await manager.send_to_user(
        requester_remote_id,
        {
            "type": "permission_response",
            "session_id": data.session_id,
            "feature": feature,
            "approved": data.approved,
            "responded_by": current_remote_id
        }
    )

    return {
        "message": (
            f"Permission for '{feature}' "
            f"{'granted' if data.approved else 'denied'}"
        ),
        "session_id": data.session_id,
        "feature": feature,
        "approved": data.approved
    }





@router.post("/revoke")
async def revoke_permission(
    data: PermissionResponse,
    current_user: dict = Depends(get_current_user)
):

    feature = data.feature.lower().strip()

    if feature not in VALID_FEATURES:
        raise HTTPException(
            status_code=400,
            detail="Invalid feature name"
        )

    # Find session
    session = await sessions_collection.find_one(
        {
            "session_id": data.session_id
        }
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    current_remote_id = current_user["remote_id"]

    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    # Check current permission
    permissions = session.get(
        "permissions",
        {}
    )

    if permissions.get(feature) is not True:

        raise HTTPException(
            status_code=400,
            detail=f"Permission '{feature}' is not active"
        )

    # Revoke
    await sessions_collection.update_one(
        {
            "session_id": data.session_id
        },
        {
            "$set": {
                f"permissions.{feature}": False,
                f"permission_requests.{feature}.status":
                    "revoked"
            }
        }
    )

    # Notify other user
    await manager.send_to_user(
        other_remote_id,
        {
            "type": "permission_revoked",
            "session_id": data.session_id,
            "feature": feature,
            "revoked_by": current_remote_id
        }
    )

    return {
        "message": f"Permission for '{feature}' revoked",
        "session_id": data.session_id,
        "feature": feature,
        "status": "revoked"
    }



@router.get("/status/{session_id}")
async def get_permission_status(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):

    session = await sessions_collection.find_one(
        {
            "session_id": session_id
        }
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    current_remote_id = current_user["remote_id"]

    # Check participant
    get_other_user_remote_id(
        session,
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