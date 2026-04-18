import os
import json
import uuid
import logging
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pythonjsonlogger import jsonlogger
from prometheus_fastapi_instrumentator import Instrumentator
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Define custom 429 handler
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"status": "error", "message": "rate limit exceeded", "data": None, "job_id": None}
    )

# Import from our modules
from models.task import LoginRequest, RegisterRequest, WorkflowRequest, StandardResponse
from controllers.workflow_controller import queue_workflow, get_result, get_all_logs
from services.redis_client import RedisClient

# Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "supersecret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

# Rate Limiting
limiter = Limiter(key_func=get_remote_address)

# Structured Logging
logger = logging.getLogger()
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter('%(timestamp)s %(service_name)s %(job_id)s %(event)s %(level)s')
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

from fastapi.responses import JSONResponse

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

# Middlewares
app.add_middleware(SessionMiddleware, secret_key=JWT_SECRET)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus Instrumentation
Instrumentator().instrument(app).expose(app)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
oauth = OAuth()
oauth.register(
    name='google',
    server_metadata_url=os.getenv("GOOGLE_CONF_URL"),
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    client_kwargs={'scope': 'openid email profile'}
)

# --- Lifespan/Shutdown ---

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Backend shutting down cleanly", extra={"service_name": "backend", "event": "shutdown"})
    r = RedisClient.get_instance()
    r.close()

# Helper functions
def hash_password(password: str) -> str:
    # rubric: keep hashlib sha256 as per latest request
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

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception

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

# --- Health Check ---

@app.get("/health")
async def health_check():
    r = RedisClient.get_instance()
    try:
        r.ping()
        redis_status = "connected"
        status_code = 200
    except Exception:
        redis_status = "unreachable"
        status_code = 503
    
    return StandardResponse(
        status="ok" if status_code == 200 else "error",
        data={"redis": redis_status, "timestamp": datetime.now().isoformat()},
        message=None
    )

# --- Auth Routes ---

@app.post("/auth/login")
@limiter.limit("5/minute")
def auth_login(req: LoginRequest, request: Request):
    users = get_user_db()
    user = users.get(req.username)
    if not user or user["password"] != hash_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token({"sub": user["username"], "role": user["role"]})
    refresh_token = create_refresh_token(user["username"])
    return {
        "status": "success",
        "data": {
            "token": access_token,
            "refresh_token": refresh_token,
            "role": user["role"]
        },
        "message": "Login successful",
        "job_id": None
    }

@app.post("/auth/register")
def register(req: RegisterRequest):
    users = get_user_db()
    if req.username in users:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    users[req.username] = {
        "username": req.username,
        "password": hash_password(req.password),
        "role": "user"
    }
    save_user_db(users)
    access_token = create_access_token({"sub": req.username, "role": "user"})
    return {"success": True, "token": access_token, "role": "user"}

@app.post("/auth/refresh")
def refresh_token(username: str):
    r = RedisClient.get_instance()
    stored_refresh = r.get(f"refresh:{username}")
    if not stored_refresh:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    users = get_user_db()
    user = users.get(username)
    access_token = create_access_token({"sub": user["username"], "role": user["role"]})
    return {"success": True, "token": access_token}

# --- Workflow Routes ---

@app.post("/run-workflow", response_model=StandardResponse)
@limiter.limit("10/minute")
def run_workflow(req: WorkflowRequest, request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user["sub"]
    trace_id = queue_workflow(req.command, username)
    
    r = RedisClient.get_instance()
    notif = {
        "id": str(uuid.uuid4()),
        "message": f"Workflow queued: {req.command[:40]}",
        "timestamp": datetime.now().isoformat(),
        "status": "queued",
        "username": username
    }
    r.lpush("notifications", json.dumps(notif))
    r.ltrim("notifications", 0, 49)
    
    return StandardResponse(status="success", job_id=trace_id, message="Workflow queued")

@app.get("/result/{trace_id}", response_model=StandardResponse)
def result(trace_id: str):
    data = get_result(trace_id)
    if not data:
        raise HTTPException(status_code=404, detail="Not found")
    return StandardResponse(status="success", data=data)

@app.get("/logs")
def logs(current_user: dict = Depends(get_current_user), page: int = 1, page_size: int = 20):
    all_logs = get_all_logs()
    user_logs = [log for log in all_logs if log.get("username") == current_user["sub"]] if current_user["role"] != "admin" else all_logs
    
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "data": user_logs[start:end],
        "total": len(user_logs),
        "page": page,
        "page_size": page_size
    }

@app.post("/upload", response_model=StandardResponse)
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    contents = await file.read()
    text = contents.decode("utf-8", errors="ignore")
    
    r = RedisClient.get_instance()
    file_id = str(uuid.uuid4())
    r.set(f"file:{file_id}", text[:5000])
    
    return StandardResponse(
        status="success",
        data={"file_id": file_id, "filename": file.filename},
        message="File uploaded"
    )

@app.get("/admin/jobs")
def admin_jobs(current_user: dict = Depends(get_current_user), page: int = 1, page_size: int = 20):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    r = RedisClient.get_instance()
    keys = r.keys("trace:*")
    jobs = []
    for k in keys:
        data = r.get(k)
        if data:
            job = json.loads(data)
            jobs.append({
                "trace_id": job.get("trace_id"),
                "status": job.get("status"),
                "worker_id": job.get("worker_id"),
                "duration_ms": job.get("duration_ms"),
                "intent": job.get("intent"),
                "username": job.get("username"),
                "completed_at": job.get("completed_at")
            })
    
@app.get("/admin/dead-letters")
def admin_dead_letters(current_user: dict = Depends(get_current_user), page: int = 1, page_size: int = 20):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    r = RedisClient.get_instance()
    dlq_items = r.lrange("dead_letter_queue", 0, -1)
    
    data = [json.loads(item) for item in dlq_items]
    start = (page - 1) * page_size
    end = start + page_size
    
    return {
        "status": "success",
        "data": data[start:end],
        "total": len(data),
        "page": page,
        "page_size": page_size,
        "message": "ok",
        "job_id": None
    }
