from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from datetime import datetime, timezone
from pathlib import Path
import uuid
import os

from app.middleware.auth_middleware import get_current_user
from app.websocket.connection_manager import manager
from app.database.mongodb import sessions_collection, database


router = APIRouter(
    prefix="/file",
    tags=["File Transfer"]
)


file_collection = database["file_transfers"]

BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BASE_DIR / "uploads"

UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True
)


MAX_FILE_SIZE = 100 * 1024 * 1024


def validate_session(
    session: dict,
    current_remote_id: str
):
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


def validate_file_permission(session: dict):
    if session.get(
        "permissions",
        {}
    ).get("file_transfer") is not True:
        raise HTTPException(
            status_code=403,
            detail="File transfer permission not granted"
        )


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


def get_safe_filename(filename: str) -> str:
    filename = os.path.basename(filename)

    if not filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid file name"
        )

    return filename


@router.post("/upload")
async def upload_file(
    session_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    current_remote_id = current_user["remote_id"]

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    validate_session(
        session,
        current_remote_id
    )

    validate_file_permission(session)

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="File name is required"
        )

    original_filename = get_safe_filename(
        file.filename
    )

    file_id = str(uuid.uuid4())

    stored_filename = f"{file_id}_{original_filename}"

    file_path = UPLOAD_DIR / stored_filename

    total_size = 0

    try:
        with open(
            file_path,
            "wb"
        ) as buffer:

            while True:
                chunk = await file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                total_size += len(chunk)

                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="File size exceeds 100 MB limit"
                    )

                buffer.write(chunk)

    except HTTPException:
        if file_path.exists():
            file_path.unlink()

        raise

    except Exception as e:
        if file_path.exists():
            file_path.unlink()

        raise HTTPException(
            status_code=500,
            detail=f"File upload failed: {str(e)}"
        )

    finally:
        await file.close()

    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    created_at = datetime.now(
        timezone.utc
    )

    file_doc = {
        "file_id": file_id,
        "session_id": session_id,
        "from_remote_id": current_remote_id,
        "to_remote_id": other_remote_id,
        "filename": original_filename,
        "stored_filename": stored_filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": total_size,
        "path": str(file_path),
        "status": "uploaded",
        "created_at": created_at
    }

    await file_collection.insert_one(
        file_doc
    )

    await manager.send_to_user(
        other_remote_id,
        {
            "type": "file_received",
            "session_id": session_id,
            "file_id": file_id,
            "from_remote_id": current_remote_id,
            "filename": original_filename,
            "content_type": file.content_type or "application/octet-stream",
            "size": total_size,
            "created_at": created_at.isoformat()
        }
    )

    return {
        "message": "File uploaded successfully",
        "file_id": file_id,
        "filename": original_filename,
        "size": total_size,
        "session_id": session_id
    }


@router.get("/list/{session_id}")
async def list_files(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    current_remote_id = current_user["remote_id"]

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    validate_session(
        session,
        current_remote_id
    )

    validate_file_permission(session)

    files = []

    cursor = file_collection.find({
        "session_id": session_id
    }).sort(
        "created_at",
        -1
    )

    async for file_doc in cursor:
        files.append({
            "file_id": file_doc.get("file_id"),
            "filename": file_doc.get("filename"),
            "content_type": file_doc.get("content_type"),
            "size": file_doc.get("size"),
            "from_remote_id": file_doc.get("from_remote_id"),
            "to_remote_id": file_doc.get("to_remote_id"),
            "status": file_doc.get("status"),
            "created_at": (
                file_doc.get("created_at").isoformat()
                if file_doc.get("created_at")
                else None
            )
        })

    return {
        "session_id": session_id,
        "files": files
    }


@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    current_remote_id = current_user["remote_id"]

    file_doc = await file_collection.find_one({
        "file_id": file_id
    })

    if not file_doc:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    if current_remote_id not in {
        file_doc.get("from_remote_id"),
        file_doc.get("to_remote_id")
    }:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this file"
        )

    session = await sessions_collection.find_one({
        "session_id": file_doc.get("session_id")
    })

    validate_session(
        session,
        current_remote_id
    )

    validate_file_permission(session)

    file_path = Path(
        file_doc.get("path", "")
    )

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Physical file not found"
        )

    return FileResponse(
        path=str(file_path),
        filename=file_doc.get("filename"),
        media_type=file_doc.get(
            "content_type",
            "application/octet-stream"
        )
    )


@router.get("/{file_id}")
async def get_file_info(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    current_remote_id = current_user["remote_id"]

    file_doc = await file_collection.find_one({
        "file_id": file_id
    })

    if not file_doc:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    if current_remote_id not in {
        file_doc.get("from_remote_id"),
        file_doc.get("to_remote_id")
    }:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this file"
        )

    session = await sessions_collection.find_one({
        "session_id": file_doc.get("session_id")
    })

    validate_session(
        session,
        current_remote_id
    )

    validate_file_permission(session)

    return {
        "file_id": file_doc.get("file_id"),
        "session_id": file_doc.get("session_id"),
        "filename": file_doc.get("filename"),
        "content_type": file_doc.get("content_type"),
        "size": file_doc.get("size"),
        "from_remote_id": file_doc.get("from_remote_id"),
        "to_remote_id": file_doc.get("to_remote_id"),
        "status": file_doc.get("status"),
        "created_at": (
            file_doc.get("created_at").isoformat()
            if file_doc.get("created_at")
            else None
        )
    }


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    current_remote_id = current_user["remote_id"]

    file_doc = await file_collection.find_one({
        "file_id": file_id
    })

    if not file_doc:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    if current_remote_id not in {
        file_doc.get("from_remote_id"),
        file_doc.get("to_remote_id")
    }:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this file"
        )

    session = await sessions_collection.find_one({
        "session_id": file_doc.get("session_id")
    })

    validate_session(
        session,
        current_remote_id
    )

    validate_file_permission(session)

    file_path = file_doc.get("path")

    if file_path and os.path.exists(file_path):
        os.remove(file_path)

    await file_collection.delete_one({
        "file_id": file_id
    })

    await manager.send_to_user(
        file_doc.get("to_remote_id"),
        {
            "type": "file_deleted",
            "session_id": file_doc.get("session_id"),
            "file_id": file_id,
            "deleted_by": current_remote_id
        }
    )

    return {
        "message": "File deleted successfully",
        "file_id": file_id
    }