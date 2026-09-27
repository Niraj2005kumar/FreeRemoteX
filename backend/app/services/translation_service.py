import httpx

# LibreTranslate ka free public instance (production mein apna khud host karna better hai)
LIBRETRANSLATE_URL = "https://libretranslate.de/translate"

# Language codes jo LibreTranslate support karta hai
LANGUAGE_CODES = {
    "English": "en",
    "Hindi": "hi",
    "Hinglish": "hi",  # Hinglish ke liye Hindi hi use karenge, output ko roman script mein convert alag se karna padega
    "Spanish": "es",
    "French": "fr",
    "German": "de",
    "Arabic": "ar",
    "Chinese": "zh",
}

async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """
    text: jo translate karna hai
    source_lang, target_lang: 'English', 'Hindi' jaise readable names
    """
    source_code = LANGUAGE_CODES.get(source_lang, "en")
    target_code = LANGUAGE_CODES.get(target_lang, "en")

    if source_code == target_code:
        return text  # same language, translation ki zarurat nahi

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                LIBRETRANSLATE_URL,
                json={
                    "q": text,
                    "source": source_code,
                    "target": target_code,
                    "format": "text"
                },
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            result = response.json()
            return result.get("translatedText", text)

        except Exception as e:
            print("❌ Translation error:", e)
            return text  # error aaye to original text hi wapas bhej do