from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

client = AsyncIOMotorClient(settings.MONGO_URI)
database = client[settings.DATABASE_NAME]

# Collections
users_collection = database["users"]
sessions_collection = database["sessions"]
connection_requests_collection = database["connection_requests"]
permissions_collection = database["permissions"]

async def check_connection():
    try:
        await client.admin.command("ping")
        print("✅ MongoDB connected successfully")
    except Exception as e:
        print("❌ MongoDB connection failed:", e)