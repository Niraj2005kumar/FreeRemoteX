from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.mongodb import check_connection
from app.routes import auth_routes

app = FastAPI(title="RemoteX Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)

@app.on_event("startup")
async def startup_event():
    await check_connection()

@app.get("/")
async def root():
    return {"message": "RemoteX backend is running 🚀"}