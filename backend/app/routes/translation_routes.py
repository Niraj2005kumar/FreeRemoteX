from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid

from app.middleware.auth_middleware import get_current_user
from app.database.mongodb import sessions_collection, database
from app.websocket.connection_manager import manager


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

    if session.get("status") != "active":
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

    if language.lower() not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported language"
        )


@router.post("/translate")
async def translate_text(
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

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty"
        )

    validate_language(
        source_language
    )

    validate_language(
        target_language
    )

    session = await sessions_collection.find_one({
        "session_id": session_id
    })

    validate_session(
        session,
        current_remote_id
    )

    if session.get(
        "permissions",
        {}
    ).get("translation") is not True:

        raise HTTPException(
            status_code=403,
            detail="Translation permission not granted"
        )

    translation_id = str(
        uuid.uuid4()
    )

    translation_doc = {
        "translation_id": translation_id,
        "session_id": session_id,
        "from_remote_id": current_remote_id,
        "source_language": source_language.lower(),
        "target_language": target_language.lower(),
        "original_text": text.strip(),
        "translated_text": None,
        "status": "pending",
        "created_at": datetime.now(
            timezone.utc
        )
    }

    await translation_collection.insert_one(
        translation_doc
    )

    return {
        "translation_id": translation_id,
        "session_id": session_id,
        "source_language": source_language.lower(),
        "target_language": target_language.lower(),
        "original_text": text.strip(),
        "translated_text": None,
        "status": "pending"
    }


@router.post("/result/{translation_id}")
async def save_translation_result(
    translation_id: str,
    translated_text: str,
    current_user: dict = Depends(
        get_current_user
    )
):

    current_remote_id = current_user[
        "remote_id"
    ]

    if not translated_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Translated text cannot be empty"
        )

    translation = await translation_collection.find_one({
        "translation_id": translation_id
    })

    if not translation:
        raise HTTPException(
            status_code=404,
            detail="Translation request not found"
        )

    if translation.get(
        "from_remote_id"
    ) != current_remote_id:

        raise HTTPException(
            status_code=403,
            detail="You cannot update this translation"
        )

    session = await sessions_collection.find_one({
        "session_id": translation[
            "session_id"
        ]
    })

    validate_session(
        session,
        current_remote_id
    )

    if session.get(
        "permissions",
        {}
    ).get("translation") is not True:

        raise HTTPException(
            status_code=403,
            detail="Translation permission not granted"
        )

    await translation_collection.update_one(
        {
            "translation_id": translation_id
        },
        {
            "$set": {
                "translated_text": translated_text.strip(),
                "status": "completed",
                "completed_at": datetime.now(
                    timezone.utc
                )
            }
        }
    )

    other_remote_id = get_other_user_remote_id(
        session,
        current_remote_id
    )

    await manager.send_to_user(
        other_remote_id,
        {
            "type": "translation_result",
            "translation_id": translation_id,
            "session_id": translation[
                "session_id"
            ],
            "from_remote_id": current_remote_id,
            "source_language": translation[
                "source_language"
            ],
            "target_language": translation[
                "target_language"
            ],
            "original_text": translation[
                "original_text"
            ],
            "translated_text": translated_text.strip(),
            "timestamp": datetime.now(
                timezone.utc
            ).isoformat()
        }
    )

    return {
        "message": "Translation result saved",
        "translation_id": translation_id,
        "translated_text": translated_text.strip(),
        "status": "completed"
    }


@router.get("/history/{session_id}")
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

    cursor = translation_collection.find({
        "session_id": session_id
    }).sort(
        "created_at",
        1
    )

    translations = []

    async for item in cursor:

        translations.append({
            "translation_id": item.get(
                "translation_id"
            ),
            "from_remote_id": item.get(
                "from_remote_id"
            ),
            "source_language": item.get(
                "source_language"
            ),
            "target_language": item.get(
                "target_language"
            ),
            "original_text": item.get(
                "original_text"
            ),
            "translated_text": item.get(
                "translated_text"
            ),
            "status": item.get(
                "status"
            ),
            "created_at": item.get(
                "created_at"
            ).isoformat()
            if item.get("created_at")
            else None,
            "completed_at": item.get(
                "completed_at"
            ).isoformat()
            if item.get("completed_at")
            else None
        })

    return {
        "session_id": session_id,
        "translations": translations
    }


@router.get("/languages")
async def get_supported_languages():

    return {
        "languages": sorted(
            SUPPORTED_LANGUAGES
        )
    }