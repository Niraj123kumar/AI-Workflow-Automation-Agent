import hashlib
import json
import logging
import uuid
from datetime import datetime

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from redis.exceptions import RedisError

from controllers.workflow_controller import get_all_logs, get_result, queue_workflow
from models.task import LoginRequest, WorkflowRequest
from services.redis_client import RedisClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upload constraints
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MiB
ALLOWED_UPLOAD_EXTENSIONS = {".txt", ".csv"}
ALLOWED_UPLOAD_CONTENT_TYPES = {
    "text/plain",
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "application/octet-stream",  # browsers sometimes send this for .csv
}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


users = {
    "admin": hash_password("admin123"),
    "user": hash_password("user123"),
}


def _redis_unavailable(exc: Exception) -> HTTPException:
    logger.error(f"Redis unavailable: {exc}")
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Queue backend unavailable",
    )


def _is_valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


@app.post("/login", status_code=status.HTTP_200_OK)
def login(req: LoginRequest):
    expected = users.get(req.username)
    if expected is None or expected != hash_password(req.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    logger.info(f"User {req.username} logged in")
    return {"success": True, "token": req.username}


@app.post("/run-workflow", status_code=status.HTTP_202_ACCEPTED)
def run_workflow(req: WorkflowRequest):
    try:
        trace_id = queue_workflow(req.command, req.username)
        r = RedisClient.get_instance()
        notif = {
            "id": str(uuid.uuid4()),
            "message": f"Workflow queued: {req.command[:40]}",
            "timestamp": datetime.now().isoformat(),
            "status": "queued",
        }
        r.lpush("notifications", json.dumps(notif))
        r.ltrim("notifications", 0, 49)
    except RedisError as exc:
        raise _redis_unavailable(exc) from exc
    return {"trace_id": trace_id, "status": "queued"}


@app.get("/result/{trace_id}")
def result(trace_id: str):
    if not _is_valid_uuid(trace_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="trace_id must be a valid UUID",
        )
    try:
        data = get_result(trace_id)
    except RedisError as exc:
        raise _redis_unavailable(exc) from exc
    if not data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trace not found",
        )
    return data


@app.get("/logs")
def logs():
    try:
        return get_all_logs()
    except RedisError as exc:
        raise _redis_unavailable(exc) from exc


@app.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(file: UploadFile = File(...)):
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A file is required",
        )

    filename = file.filename
    lowered = filename.lower()
    ext = "." + lowered.rsplit(".", 1)[-1] if "." in lowered else ""
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                "Unsupported file type. Allowed extensions: "
                + ", ".join(sorted(ALLOWED_UPLOAD_EXTENSIONS))
            ),
        )
    if (
        file.content_type
        and file.content_type not in ALLOWED_UPLOAD_CONTENT_TYPES
    ):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type: {file.content_type}",
        )

    try:
        contents = await file.read()
    except Exception as exc:  # defensive: underlying stream errors
        logger.error(f"Failed to read upload: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read uploaded file",
        ) from exc

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {MAX_UPLOAD_BYTES} bytes",
        )

    try:
        text = contents.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be valid UTF-8 text",
        ) from exc

    try:
        r = RedisClient.get_instance()
        file_id = str(uuid.uuid4())
        r.set(f"file:{file_id}", text[:5000])
    except RedisError as exc:
        raise _redis_unavailable(exc) from exc

    logger.info(f"File uploaded: {filename} ({len(text)} bytes)")
    return {"file_id": file_id, "filename": filename, "preview": text[:200]}


@app.get("/notifications")
def get_notifications():
    try:
        r = RedisClient.get_instance()
        items = r.lrange("notifications", 0, 19)
    except RedisError as exc:
        raise _redis_unavailable(exc) from exc

    result_items = []
    for raw in items:
        try:
            result_items.append(json.loads(raw))
        except (ValueError, TypeError) as exc:
            logger.warning(f"Skipping malformed notification: {exc}")
            continue
    return result_items
