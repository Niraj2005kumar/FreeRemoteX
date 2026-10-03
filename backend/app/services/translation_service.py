import httpx

from app.config import settings


LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "hinglish": "Hinglish",
    "bn": "Bengali",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
    "gu": "Gujarati",
    "kn": "Kannada",
    "ml": "Malayalam",
    "pa": "Punjabi",
    "ur": "Urdu",
    "od": "Odia",
    "santhali": "Santhali"
}


async def translate_text(
    text: str,
    source_language: str,
    target_language: str
) -> str:

    if source_language == target_language:
        return text.strip()

    api_key = getattr(
        settings,
        "GEMINI_API_KEY",
        ""
    )

    model = getattr(
        settings,
        "GEMINI_MODEL",
        "gemini-2.5-flash"
    )

    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured"
        )

    source_name = LANGUAGE_NAMES.get(
        source_language,
        source_language
    )

    target_name = LANGUAGE_NAMES.get(
        target_language,
        target_language
    )

    prompt = f"""
You are the translation engine for RemoteX.

Translate the following text from {source_name} to {target_name}.

Rules:
- Return only the translated text.
- Do not add explanations.
- Preserve the original meaning.
- Preserve names, numbers, URLs and technical terms where appropriate.
- Do not summarize.
- Do not change the intent.
- If the target language is Hinglish, write natural Roman Hindi mixed with commonly used English words.
- If the target language is Santhali, produce the best available natural translation.

Text:
{text}
"""

    url = (
        f"https://generativelanguage.googleapis.com/"
        f"v1beta/models/{model}:generateContent"
        f"?key={api_key}"
    )

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2
        }
    }

    try:
        async with httpx.AsyncClient(
            timeout=30.0
        ) as client:

            response = await client.post(
                url,
                json=payload
            )

        if response.status_code != 200:
            try:
                error_data = response.json()
            except Exception:
                error_data = response.text

            raise RuntimeError(
                f"Gemini API error: {error_data}"
            )

        data = response.json()

        candidates = data.get(
            "candidates",
            []
        )

        if not candidates:
            raise RuntimeError(
                "Gemini returned no translation"
            )

        parts = candidates[0].get(
            "content",
            {}
        ).get(
            "parts",
            []
        )

        translated_text = "".join(
            part.get("text", "")
            for part in parts
        ).strip()

        if not translated_text:
            raise RuntimeError(
                "Gemini returned empty translation"
            )

        return translated_text

    except httpx.TimeoutException:
        raise RuntimeError(
            "Translation service timed out"
        )

    except httpx.RequestError as e:
        raise RuntimeError(
            f"Translation service connection failed: {str(e)}"
        )