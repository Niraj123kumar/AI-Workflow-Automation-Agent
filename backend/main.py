from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from controllers.workflow_controller import queue_workflow, get_result, get_all_logs
from models.task import LoginRequest, WorkflowRequest
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

users = {"admin": "admin123", "user": "user123"}

@app.post("/login")
def login(req: LoginRequest):
    if users.get(req.username) == req.password:
        logger.info(f"User {req.username} logged in")
        return {"success": True, "token": req.username}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/run-workflow")
def run_workflow(req: WorkflowRequest):
    trace_id = queue_workflow(req.command, req.username)
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
