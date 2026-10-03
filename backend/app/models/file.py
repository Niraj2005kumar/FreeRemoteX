from pydantic import BaseModel, Field


class FileUploadResponse(BaseModel):
    file_id: str
    session_id: str
    filename: str
    size: int
    content_type: str
    uploaded_by: str
    status: str


class FileInfoResponse(BaseModel):
    file_id: str
    session_id: str
    filename: str
    size: int
    content_type: str
    uploaded_by: str
    uploaded_at: str
    status: str


class FileDeleteResponse(BaseModel):
    message: str
    file_id: str