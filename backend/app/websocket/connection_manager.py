from fastapi import WebSocket
from typing import Dict

class ConnectionManager:
    def __init__(self):
        # remote_id -> WebSocket connection mapping
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, remote_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[remote_id] = websocket
        print(f"✅ User {remote_id} connected via WebSocket")

    def disconnect(self, remote_id: str):
        if remote_id in self.active_connections:
            del self.active_connections[remote_id]
            print(f"❌ User {remote_id} disconnected")

    async def send_to_user(self, remote_id: str, message: dict):
        """Kisi specific user ko real-time message bhejo, agar wo online hai"""
        if remote_id in self.active_connections:
            await self.active_connections[remote_id].send_json(message)
            return True
        return False  # user online nahi hai

    def is_online(self, remote_id: str) -> bool:
        return remote_id in self.active_connections


# Ek hi global instance pura app mein use hoga
manager = ConnectionManager()