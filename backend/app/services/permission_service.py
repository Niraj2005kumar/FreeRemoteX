from datetime import datetime, timezone
import uuid


PERMISSION_TYPES = {
    "video",
    "voice",
    "chat",
    "screen",
    "mouse",
    "keyboard",
    "file_transfer",
    "translation",
}


def create_permission_document(
    session_id: str,
    requester_id: str,
    receiver_id: str,
    permission_type: str,
):
    if permission_type not in PERMISSION_TYPES:
        raise ValueError(
            f"Invalid permission type: {permission_type}"
        )

    return {
        "permission_id": "PERM-" + uuid.uuid4().hex[:10].upper(),
        "session_id": session_id,
        "requester_id": requester_id,
        "receiver_id": receiver_id,
        "permission_type": permission_type,
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
        "accepted_at": None,
        "rejected_at": None,
        "revoked_at": None,
    }