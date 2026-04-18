import os
import logging
from datetime import datetime
from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pythonjsonlogger import jsonlogger
from prometheus_fastapi_instrumentator import Instrumentator, Metrics
from prometheus_client import Gauge, Counter
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse

# Import models
from models.task import LoginRequest, RegisterRequest, WorkflowRequest, StandardResponse

# Import controllers
from controllers import auth_controller, workflow_controller
from services.redis_client import RedisClient

# Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "supersecret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

# Rate Limiting
limiter = Limiter(key_func=get_remote_address)

async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"status": "error", "message": "rate limit exceeded", "data": None, "job_id": None}
    )

# Structured Logging
logger = logging.getLogger()
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter('%(timestamp)s %(service_name)s %(job_id)s %(event)s %(level)s')
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

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

# Custom Metrics
TASK_QUEUE_DEPTH = Gauge("task_queue_depth", "Depth of the task queue")
JOB_SUCCESS_TOTAL = Counter("job_success_total", "Total number of successful jobs")
JOB_FAILURE_TOTAL = Counter("job_failure_total", "Total number of failed jobs")
TOOL_USAGE_TOTAL = Counter("tool_usage_total", "Total tool usage", ["tool_name"])

def update_metrics():
    r = RedisClient.get_instance()
    TASK_QUEUE_DEPTH.set(r.llen("task_queue"))

instrumentator = Instrumentator()
@instrumentator.metrics()
def custom_metrics(metrics: Metrics):
    update_metrics()

instrumentator.instrument(app).expose(app)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
oauth = OAuth()
oauth.register(
    name='google',
    server_metadata_url=os.getenv("GOOGLE_CONF_URL"),
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    client_kwargs={'scope': 'openid email profile'}
)

# --- Auth Helpers ---

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

# --- Lifespan/Shutdown ---

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Backend shutting down cleanly", extra={"service_name": "backend", "event": "shutdown"})
    r = RedisClient.get_instance()
    r.close()

# --- Health Check ---

@app.get("/health")
async def health_check():
    r = RedisClient.get_instance()
    try:
        r.ping()
        return JSONResponse(
            status_code=200,
            content={"status": "ok", "redis": "connected", "timestamp": datetime.now().isoformat()}
        )
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "redis": "unreachable", "timestamp": datetime.now().isoformat()}
        )

# --- Auth Routes ---

@app.post("/auth/login", response_model=StandardResponse)
@limiter.limit("5/minute")
def auth_login(req: LoginRequest, request: Request):
    data = auth_controller.login_user(req.username, req.password)
    return StandardResponse(
        status="success",
        data=data,
        message="Login successful",
        job_id=None
    )

@app.post("/auth/register", response_model=StandardResponse)
def register(req: RegisterRequest):
    data = auth_controller.register_user(req.username, req.password)
    return StandardResponse(
        status="success",
        data=data,
        message="Registration successful",
        job_id=None
    )

@app.post("/auth/refresh", response_model=StandardResponse)
def refresh_token(username: str):
    data = auth_controller.refresh_user_token(username)
    return StandardResponse(
        status="success",
        data=data,
        message="Token refreshed",
        job_id=None
    )

# --- Workflow Routes ---

@app.post("/run-workflow", response_model=StandardResponse)
@limiter.limit("10/minute")
def run_workflow(req: WorkflowRequest, request: Request, current_user: dict = Depends(get_current_user)):
    job_id = workflow_controller.queue_workflow(req.command, current_user["sub"])
    return StandardResponse(status="success", job_id=job_id, message="Workflow queued")

@app.get("/result/{trace_id}", response_model=StandardResponse)
def result(trace_id: str):
    data = workflow_controller.get_result(trace_id)
    if not data:
        raise HTTPException(status_code=404, detail="Not found")
    
    if data.get("status") == "completed":
        JOB_SUCCESS_TOTAL.inc()
        if data.get("intent"):
            TOOL_USAGE_TOTAL.labels(tool_name=data["intent"]).inc()
    elif data.get("status") in ["failed", "DEAD"]:
        JOB_FAILURE_TOTAL.inc()
        
    return StandardResponse(status="success", data=data)

@app.get("/logs", response_model=StandardResponse)
def logs(current_user: dict = Depends(get_current_user), page: int = 1, page_size: int = 20):
    all_logs = workflow_controller.get_all_logs()
    user_logs = [log for log in all_logs if log.get("username") == current_user["sub"]] if current_user["role"] != "admin" else all_logs
    
    start = (page - 1) * page_size
    end = start + page_size
    return StandardResponse(
        status="success",
        data=user_logs[start:end],
        message="ok",
        job_id=None
    )

@app.get("/notifications")
def get_notifications(current_user: dict = Depends(get_current_user)):
    data = workflow_controller.get_notifications(current_user["sub"])
    return data

@app.post("/upload", response_model=StandardResponse)
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    contents = await file.read()
    text = contents.decode("utf-8", errors="ignore")
    data = workflow_controller.handle_file_upload(text, file.filename)
    return StandardResponse(status="success", data=data, message="File uploaded")

# --- Admin Routes ---

@app.get("/admin/jobs", response_model=StandardResponse)
def admin_jobs(current_user: dict = Depends(get_current_user), page: int = 1, page_size: int = 20):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    jobs = workflow_controller.get_admin_jobs()
    start = (page - 1) * page_size
    end = start + page_size
    return StandardResponse(
        status="success",
        data=jobs[start:end],
        message="ok",
        job_id=None
    )

@app.get("/admin/workers", response_model=StandardResponse)
def admin_workers(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    workers = workflow_controller.get_admin_workers()
    return StandardResponse(
        status="success",
        data=workers,
        message="ok",
        job_id=None
    )

@app.get("/admin/dead-letters", response_model=StandardResponse)
def admin_dead_letters(current_user: dict = Depends(get_current_user), page: int = 1, page_size: int = 20):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    dlq = workflow_controller.get_admin_dead_letters()
    start = (page - 1) * page_size
    end = start + page_size
    return StandardResponse(
        status="success",
        data=dlq[start:end],
        message="ok",
        job_id=None
    )
