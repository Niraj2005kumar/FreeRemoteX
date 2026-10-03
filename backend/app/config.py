import os

from dotenv import load_dotenv

load_dotenv()


class Settings:

    MONGO_URI: str = os.getenv(
        "MONGO_URI",
        "mongodb://localhost:27017"
    )

    DATABASE_NAME: str = os.getenv(
        "DATABASE_NAME",
        "remotex_db"
    )

    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        "default_secret"
    )

    ALGORITHM: str = os.getenv(
        "ALGORITHM",
        "HS256"
    )

    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv(
            "ACCESS_TOKEN_EXPIRE_MINUTES",
            1440
        )
    )


settings = Settings()