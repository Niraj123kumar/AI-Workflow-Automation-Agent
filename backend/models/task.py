from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Any

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[EmailStr] = None
    role: Optional[str] = "user"

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class OTPVerifyRequest(BaseModel):
    username: str
    otp: str

class WorkflowRequest(BaseModel):
    command: str
    username: str

    @field_validator('command')
    @classmethod
    def validate_command(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Command cannot be empty')
        if len(v) < 3:
            raise ValueError('Command too short (min 3 chars)')
        if len(v) > 5000:
            raise ValueError('Command too long (max 5000 chars)')
        return v

class StandardResponse(BaseModel):
    status: str
    data: Optional[Any] = None
    message: Optional[str] = None
    job_id: Optional[str] = None
