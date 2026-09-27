from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.mongodb import check_connection
from app.routes import (
    auth_routes,
    user_routes,
    connection_routes,
    permission_routes,
    translation_routes,
    chat_routes,
    file_routes
)
from app.websocket import signaling

app = FastAPI(title="RemoteX Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(user_routes.router)
app.include_router(connection_routes.router)
app.include_router(permission_routes.router)
app.include_router(translation_routes.router)
app.include_router(chat_routes.router)
app.include_router(file_routes.router)
app.include_router(signaling.router)

@app.on_event("startup")
async def startup_event():
    await check_connection()

@app.get("/")
async def root():
    return {"message": "RemoteX backend is running 🚀"}