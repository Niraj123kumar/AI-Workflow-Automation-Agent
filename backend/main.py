import hashlib
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from controllers.workflow_controller import queue_workflow, get_result, get_all_logs
from models.task import LoginRequest, WorkflowRequest
import logging
import json
from services.redis_client import RedisClient
from datetime import datetime
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

users = {
    "admin": hash_password("admin123"),
    "user": hash_password("user123")
}

@app.post("/login")
def login(req: LoginRequest):
    if users.get(req.username) == hash_password(req.password):
        logger.info(f"User {req.username} logged in")
        return {"success": True, "token": req.username}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/run-workflow")
def run_workflow(req: WorkflowRequest):
    trace_id = queue_workflow(req.command, req.username)
    r = RedisClient.get_instance()
    notif = {"id": str(uuid.uuid4()), "message": f"Workflow queued: {req.command[:40]}", "timestamp": datetime.now().isoformat(), "status": "queued"}
    r.lpush("notifications", json.dumps(notif))
    r.ltrim("notifications", 0, 49)
    return {"trace_id": trace_id, "status": "queued"}

@app.get("/result/{trace_id}")
def result(trace_id: str):
    data = get_result(trace_id)
    if not data:
        raise HTTPException(status_code=404, detail="Not found")
    return data

@app.get("/logs")
def logs():
    return get_all_logs()

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()
    text = contents.decode("utf-8", errors="ignore")
    r = RedisClient.get_instance()
    file_id = str(uuid.uuid4())
    r.set(f"file:{file_id}", text[:5000])
    logger.info(f"File uploaded: {file.filename} ({len(text)} bytes)")
    return {"file_id": file_id, "filename": file.filename, "preview": text[:200]}

@app.get("/notifications")
def get_notifications():
    r = RedisClient.get_instance()
    items = r.lrange("notifications", 0, 19)
    return [json.loads(i) for i in items]
