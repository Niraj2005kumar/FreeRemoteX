from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings


client = AsyncIOMotorClient(
    settings.MONGO_URI
)

database = client[
    settings.DATABASE_NAME
]


users_collection = database["users"]
connection_requests_collection = database["connection_requests"]
sessions_collection = database["sessions"]
chat_messages_collection = database["chat_messages"]
file_transfers_collection = database["file_transfers"]
translation_history_collection = database["translation_history"]
desktop_agents_collection = database["desktop_agents"]


async def check_connection():
    try:
        await client.admin.command("ping")
        print("MongoDB connected successfully")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")
        raise