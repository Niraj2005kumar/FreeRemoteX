from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid

from app.middleware.auth_middleware import get_current_user
from app.database.mongodb import sessions_collection, database
from app.websocket.connection_manager import manager
from app.services.translation_service import translate_text


router = APIRouter(
    prefix="/translation",
    tags=["Translation"]
)


translation_collection = database[
    "translations"
]


SUPPORTED_LANGUAGES = {
    "en",
    "hi",
    "hinglish",
    "bn",
    "ta",
    "te",
    "mr",
    "gu",
    "kn",
    "ml",
    "pa",
    "ur",
    "od",
    "santhali"
}


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

    if session.get(
        "status"
    ) != "active":

        raise HTTPException(
            status_code=400,
            detail="Session is not active"
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


def validate_language(
    language: str
):

    language = language.lower().strip()

    if language not in SUPPORTED_LANGUAGES:

        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported language: "
                f"{language}"
            )
        )

    return language


def validate_translation_permission(
    session: dict
):

    if session.get(
        "permissions",
        {}
    ).get("translation") is not True:

        raise HTTPException(
            status_code=403,
            detail="Translation permission not granted"
        )


@router.post("/translate")
async def translate(
    session_id: str,
    text: str,
    source_language: str,
    target_language: str,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    text = text.strip()

    if not text:

        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty"
        )

    if len(text) > 10000:

        raise HTTPException(
            status_code=400,
            detail="Text cannot exceed 10000 characters"
        )

    source_language = validate_language(
        source_language
    )

    target_language = validate_language(
        target_language
    )

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    validate_session(
        session,
        current_remote_id
    )

    validate_translation_permission(
        session
    )

    translation_id = str(
        uuid.uuid4()
    )

    created_at = datetime.now(
        timezone.utc
    )

    translation_doc = {
        "translation_id":
            translation_id,
        "session_id":
            session_id,
        "from_remote_id":
            current_remote_id,
        "source_language":
            source_language,
        "target_language":
            target_language,
        "original_text":
            text,
        "translated_text":
            None,
        "status":
            "processing",
        "created_at":
            created_at,
        "completed_at":
            None
    }

    await translation_collection.insert_one(
        translation_doc
    )

    try:

        translated_text = await translate_text(
            text=text,
            source_language=source_language,
            target_language=target_language
        )

        completed_at = datetime.now(
            timezone.utc
        )

        await translation_collection.update_one(
            {
                "translation_id":
                    translation_id
            },
            {
                "$set": {
                    "translated_text":
                        translated_text,
                    "status":
                        "completed",
                    "completed_at":
                        completed_at
                }
            }
        )

        other_remote_id = get_other_user_remote_id(
            session,
            current_remote_id
        )

        translation_message = {
            "type":
                "translation_result",
            "translation_id":
                translation_id,
            "session_id":
                session_id,
            "from_remote_id":
                current_remote_id,
            "source_language":
                source_language,
            "target_language":
                target_language,
            "original_text":
                text,
            "translated_text":
                translated_text,
            "status":
                "completed",
            "timestamp":
                completed_at.isoformat()
        }

        await manager.send_to_user(
            other_remote_id,
            translation_message
        )

        await manager.send_to_user(
            current_remote_id,
            translation_message
        )

        return {
            "translation_id":
                translation_id,
            "session_id":
                session_id,
            "source_language":
                source_language,
            "target_language":
                target_language,
            "original_text":
                text,
            "translated_text":
                translated_text,
            "status":
                "completed",
            "created_at":
                created_at.isoformat(),
            "completed_at":
                completed_at.isoformat()
        }

    except Exception as e:

        failed_at = datetime.now(
            timezone.utc
        )

        await translation_collection.update_one(
            {
                "translation_id":
                    translation_id
            },
            {
                "$set": {
                    "status":
                        "failed",
                    "error":
                        str(e),
                    "completed_at":
                        failed_at
                }
            }
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"Translation failed: {str(e)}"
            )
        )


@router.get(
    "/history/{session_id}"
)
async def get_translation_history(
    session_id: str,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    validate_session(
        session,
        current_remote_id
    )

    validate_translation_permission(
        session
    )

    cursor = translation_collection.find({
        "session_id": session_id
    }).sort(
        "created_at",
        1
    )

    translations = []

    async for item in cursor:

        translations.append({
            "translation_id":
                item.get(
                    "translation_id"
                ),
            "from_remote_id":
                item.get(
                    "from_remote_id"
                ),
            "source_language":
                item.get(
                    "source_language"
                ),
            "target_language":
                item.get(
                    "target_language"
                ),
            "original_text":
                item.get(
                    "original_text"
                ),
            "translated_text":
                item.get(
                    "translated_text"
                ),
            "status":
                item.get(
                    "status"
                ),
            "created_at":
                item.get(
                    "created_at"
                ).isoformat()
                if item.get(
                    "created_at"
                )
                else None,
            "completed_at":
                item.get(
                    "completed_at"
                ).isoformat()
                if item.get(
                    "completed_at"
                )
                else None
        })

    return {
        "session_id":
            session_id,
        "translations":
            translations
    }


@router.get("/languages")
async def get_supported_languages():

    return {
        "languages": sorted(
            SUPPORTED_LANGUAGES
        )
    }