from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.database.mongodb import (
    users_collection,
    connection_requests_collection
)

from app.schemas.connection import ConnectionRequestCreate
from app.utils.security import get_current_user


router = APIRouter(
    prefix="/connections",
    tags=["Connections"]
)





@router.post("/request")
async def send_connection_request(
    data: ConnectionRequestCreate,
    current_user: str = Depends(get_current_user)
):

    sender_id = current_user
    receiver_id = data.receiver_id.upper()

    # User cannot send request to himself
    if sender_id == receiver_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot send a connection request to yourself"
        )

    # Check receiver
    receiver = await users_collection.find_one(
        {
            "user_id": receiver_id
        }
    )

    if not receiver:
        raise HTTPException(
            status_code=404,
            detail="Remote user not found"
        )

    # Check existing pending request
    existing_request = await connection_requests_collection.find_one(
        {
            "sender_id": sender_id,
            "receiver_id": receiver_id,
            "status": "pending"
        }
    )

    if existing_request:
        raise HTTPException(
            status_code=409,
            detail="Connection request already pending"
        )

    # Generate request ID
    request_id = "REQ-" + uuid.uuid4().hex[:10].upper()

    request_data = {
        "request_id": request_id,
        "sender_id": sender_id,
        "receiver_id": receiver_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc)
    }

    await connection_requests_collection.insert_one(
        request_data
    )

    return {
        "message": "Connection request sent successfully",
        "request_id": request_id,
        "sender_id": sender_id,
        "receiver_id": receiver_id,
        "status": "pending"
    }




@router.get("/received")
async def get_received_requests(
    current_user: str = Depends(get_current_user)
):

    cursor = connection_requests_collection.find(
        {
            "receiver_id": current_user,
            "status": "pending"
        }
    )

    requests = await cursor.to_list(length=100)

    result = []

    for request in requests:

        result.append(
            {
                "request_id": request["request_id"],
                "sender_id": request["sender_id"],
                "receiver_id": request["receiver_id"],
                "status": request["status"],
                "created_at": request["created_at"].isoformat()
            }
        )

    return {
        "count": len(result),
        "requests": result
    }





@router.get("/sent")
async def get_sent_requests(
    current_user: str = Depends(get_current_user)
):

    cursor = connection_requests_collection.find(
        {
            "sender_id": current_user
        }
    )

    requests = await cursor.to_list(length=100)

    result = []

    for request in requests:

        result.append(
            {
                "request_id": request["request_id"],
                "sender_id": request["sender_id"],
                "receiver_id": request["receiver_id"],
                "status": request["status"],
                "created_at": request["created_at"].isoformat()
            }
        )

    return {
        "count": len(result),
        "requests": result
    }




@router.post("/{request_id}/accept")
async def accept_connection_request(
    request_id: str,
    current_user: str = Depends(get_current_user)
):

    request = await connection_requests_collection.find_one(
        {
            "request_id": request_id
        }
    )

    if not request:
        raise HTTPException(
            status_code=404,
            detail="Connection request not found"
        )

    # Only receiver can accept
    if request["receiver_id"] != current_user:
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to accept this request"
        )

    # Request must be pending
    if request["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Request is already {request['status']}"
        )

    await connection_requests_collection.update_one(
        {
            "request_id": request_id
        },
        {
            "$set": {
                "status": "accepted",
                "accepted_at": datetime.now(timezone.utc)
            }
        }
    )

    return {
        "message": "Connection request accepted",
        "request_id": request_id,
        "status": "accepted"
    }






@router.post("/{request_id}/reject")
async def reject_connection_request(
    request_id: str,
    current_user: str = Depends(get_current_user)
):

    request = await connection_requests_collection.find_one(
        {
            "request_id": request_id
        }
    )

    if not request:
        raise HTTPException(
            status_code=404,
            detail="Connection request not found"
        )



    if request["receiver_id"] != current_user:
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to reject this request"
        )




    if request["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Request is already {request['status']}"
        )

    await connection_requests_collection.update_one(
        {
            "request_id": request_id
        },
        {
            "$set": {
                "status": "rejected",
                "rejected_at": datetime.now(timezone.utc)
            }
        }
    )

    return {
        "message": "Connection request rejected",
        "request_id": request_id,
        "status": "rejected"
    }