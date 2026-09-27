from pydantic import BaseModel

class TranslationRequestPermission(BaseModel):
    session_id: str

class TranslateTextRequest(BaseModel):
    session_id: str
    text: str
    source_language: str  # "English"
    target_language: str  # "Hindi"

class SetTranslationLanguage(BaseModel):
    session_id: str
    target_language: str
    output_text: bool = True
    output_voice: bool = False