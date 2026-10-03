from motor.motor_asyncio import AsyncIOMotorClient
import certifi

from app.config import settings


client = AsyncIOMotorClient(
    settings.MONGO_URI,
    tls=True,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=20000
)

database = client[settings.DATABASE_NAME]

users_collection = database["users"]
connection_requests_collection = database["connection_requests"]
sessions_collection = database["sessions"]
desktop_agents_collection = database["desktop_agents"]


async def check_connection():
    try:
        await client.admin.command("ping")
        print("MongoDB connected successfully")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")
        raise