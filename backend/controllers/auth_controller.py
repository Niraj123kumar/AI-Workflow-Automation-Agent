import os
import json
import hashlib
from datetime import datetime, timedelta
from jose import jwt
from fastapi import HTTPException
from services.redis_client import RedisClient

JWT_SECRET = os.getenv("JWT_SECRET", "supersecret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(username: str):
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": username, "exp": expire, "type": "refresh"}
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    r = RedisClient.get_instance()
    r.setex(f"refresh:{username}", timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), token)
    return token

def get_user_db():
    r = RedisClient.get_instance()
    data = r.get("users_db")
    if not data:
        users = {
            "admin": {"username": "admin", "password": hash_password("admin123"), "role": "admin"},
            "user": {"username": "user", "password": hash_password("user123"), "role": "user"}
        }
        r.set("users_db", json.dumps(users))
        return users
    return json.loads(data)

def save_user_db(users):
    r = RedisClient.get_instance()
    r.set("users_db", json.dumps(users))

def login_user(username, password):
    users = get_user_db()
    user = users.get(username)
    if not user or user["password"] != hash_password(password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token({"sub": user["username"], "role": user["role"]})
    refresh_token = create_refresh_token(user["username"])
    return {
        "token": access_token,
        "refresh_token": refresh_token,
        "role": user["role"]
    }

def register_user(username, password):
    users = get_user_db()
    if username in users:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    users[username] = {
        "username": username,
        "password": hash_password(password),
        "role": "user"
    }
    save_user_db(users)
    access_token = create_access_token({"sub": username, "role": "user"})
    return {"token": access_token, "role": "user"}

def refresh_user_token(username):
    r = RedisClient.get_instance()
    stored_refresh = r.get(f"refresh:{username}")
    if not stored_refresh:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    users = get_user_db()
    user = users.get(username)
    access_token = create_access_token({"sub": user["username"], "role": user["role"]})
    return {"token": access_token}
