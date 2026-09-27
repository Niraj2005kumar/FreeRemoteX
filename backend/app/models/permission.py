from pydantic import BaseModel

# Har feature ka apna permission flag
VALID_FEATURES = [
    "video_call",
    "voice_call",
    "chat",
    "screen_share",
    "mouse_control",
    "keyboard_control",
    "file_transfer",
    "translation"
]

class PermissionRequest(BaseModel):
    session_id: str
    feature: str  # video_call, voice_call, chat, screen_share, mouse_control, keyboard_control, file_transfer, translation

class PermissionResponse(BaseModel):
    session_id: str
    feature: str
    approved: bool  # True = accept, False = reject