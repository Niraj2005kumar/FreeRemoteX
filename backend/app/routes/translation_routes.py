from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth_middleware import get_current_user
from app.models.translation import (
    TranslationRequestPermission,
    TranslateTextRequest,
    SetTranslationLanguage
)
from app.services.translation_service import translate_text
from app.websocket.connection_manager import manager
from app.database.mongodb import sessions_collection

router = APIRouter(prefix="/translation", tags=["Translation"])


def get_other_user_remote_id(session: dict, current_remote_id: str) -> str:
    if session["user_a_remote_id"] == current_remote_id:
        return session["user_b_remote_id"]
    return session["user_a_remote_id"]


@router.post("/request")
async def request_translation(
    data: TranslationRequestPermission,
    current_user: dict = Depends(get_current_user)
):
    """User 1 dusre user ko translation on karne ki request bhejta hai"""
    session = await sessions_collection.find_one({"session_id": data.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    other_remote_id = get_other_user_remote_id(session, current_user["remote_id"])

    await manager.send_to_user(other_remote_id, {
        "type": "translation_request",
        "session_id": data.session_id,
        "from_remote_id": current_user["remote_id"]
    })

    return {"message": "Translation request sent"}


@router.post("/set-language")
async def set_translation_language(
    data: SetTranslationLanguage,
    current_user: dict = Depends(get_current_user)
):
    """
    Translation accept hone ke baad, User apni target language set karta hai.
    Ye tabhi kaam karega jab permissions.translation True ho.
    """
    session = await sessions_collection.find_one({"session_id": data.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session["permissions"].get("translation", False):
        raise HTTPException(status_code=403, detail="Translation permission not granted yet")

    # Har user ki apni language preference session mein store karo
    field_prefix = "user_a" if session["user_a_remote_id"] == current_user["remote_id"] else "user_b"

    await sessions_collection.update_one(
        {"session_id": data.session_id},
        {"$set": {
            f"{field_prefix}_translation_settings": {
                "target_language": data.target_language,
                "output_text": data.output_text,
                "output_voice": data.output_voice
            }
        }}
    )

    return {"message": "Translation language preference saved"}


@router.post("/translate")
async def translate_message(
    data: TranslateTextRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Chat ya presentation ke text ko translate karo aur
    dusre user ko real-time WebSocket se translated text bhejo.
    """
    session = await sessions_collection.find_one({"session_id": data.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session["permissions"].get("translation", False):
        raise HTTPException(status_code=403, detail="Translation permission not granted")

    translated = await translate_text(
        data.text,
        data.source_language,
        data.target_language
    )

    other_remote_id = get_other_user_remote_id(session, current_user["remote_id"])

    # 🔔 Translated text real-time bhejo dusre user ko
    await manager.send_to_user(other_remote_id, {
        "type": "translated_message",
        "session_id": data.session_id,
        "original_text": data.text,
        "translated_text": translated,
        "from_remote_id": current_user["remote_id"]
    })

    return {
        "original_text": data.text,
        "translated_text": translated
    }