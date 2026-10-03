from pydantic import BaseModel, Field


class AgentRegisterRequest(BaseModel):
    device_name: str = Field(
        ...,
        min_length=1,
        max_length=100
    )


class AgentRegisterResponse(BaseModel):
    agent_id: str
    device_name: str
    status: str


class AgentCommand(BaseModel):
    session_id: str
    command: str
    data: dict = {}