from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)


class WorkflowRequest(BaseModel):
    command: str = Field(..., min_length=1, max_length=4000)
    username: str = Field(..., min_length=1, max_length=64)
