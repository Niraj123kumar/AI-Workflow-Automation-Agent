from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str

class WorkflowRequest(BaseModel):
    command: str
    username: str
