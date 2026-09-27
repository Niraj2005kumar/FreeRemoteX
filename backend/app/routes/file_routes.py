from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from datetime import datetime
import uuid
import os

from app.middleware.auth_middleware import get_current_user
from app.websocket.connection_manager import manager
from app.database.mongodb import sessions_collection, database

router = APIRouter(prefix="/file", tags=["File Transfer"])

files_collection = database["files"]

UPLOAD_DIR = "uploaded_files"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_other_user_remote_id(session: dict, current_remote_id: str) -> str:
    if session["user_a_remote_id"] == current_remote_id:
        return session["user_b_remote_id"]
    return session["user_a_remote_id"]


@router.post("/upload/{session_id}")
async def upload_file(
    session_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    session = await sessions_collection.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session["permissions"].get("file_transfer", False):
        raise HTTPException(status_code=403, detail="File transfer permission not granted")

    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    saved_filename = f"{file_id}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    file_doc = {
        "file_id": file_id,
        "session_id": session_id,
        "original_filename": file.filename,
        "saved_filename": saved_filename,
        "uploaded_by": current_user["remote_id"],
        "uploaded_at": datetime.utcnow()
    }

    await files_collection.insert_one(file_doc)

    other_remote_id = get_other_user_remote_id(session, current_user["remote_id"])

    # 🔔 Dusre user ko notify karo ki file aayi hai
    await manager.send_to_user(other_remote_id, {
        "type": "file_received",
        "session_id": session_id,
        "file_id": file_id,
        "filename": file.filename,
        "from_remote_id": current_user["remote_id"]
    })

    return {
        "message": "File uploaded successfully",
        "file_id": file_id,
        "filename": file.filename
    }


@router.get("/download/{file_id}")
async def download_file(file_id: str, current_user: dict = Depends(get_current_user)):
    file_doc = await files_collection.find_one({"file_id": file_id})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = os.path.join(UPLOAD_DIR, file_doc["saved_filename"])

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(
        path=file_path,
        filename=file_doc["original_filename"]
    )