import json
import uuid
import logging
import time
from datetime import datetime
from services.redis_client import RedisClient

logger = logging.getLogger(__name__)

def queue_workflow(command: str, username: str, recipient_email: str = None):
    r = RedisClient.get_instance()
    trace_id = str(uuid.uuid4())
    task = {
        "trace_id": trace_id,
        "command": command,
        "username": username,
        "timestamp": datetime.now().isoformat(),
        "status": "queued",
        "retry_count": 0,
        "recipient_email": recipient_email
    }
    r.lpush("task_queue", json.dumps(task))
    r.set(f"trace:{trace_id}", json.dumps(task))
    
    # Notification logic moved to controller
    notif = {
        "id": str(uuid.uuid4()),
        "message": f"Workflow queued: {command[:40]}",
        "timestamp": datetime.now().isoformat(),
        "status": "queued",
        "username": username
    }
    r.lpush("notifications", json.dumps(notif))
    r.ltrim("notifications", 0, 49)
    
    logger.info(f"[{trace_id}] Task queued: {command}")
    return trace_id

def get_result(trace_id: str):
    r = RedisClient.get_instance()
    data = r.get(f"trace:{trace_id}")
    if not data:
        return None
    return json.loads(data)

def get_all_logs():
    r = RedisClient.get_instance()
    keys = r.keys("trace:*")
    logs = []
    for k in keys:
        val = r.get(k)
        if val:
            logs.append(json.loads(val))
    return sorted(logs, key=lambda x: x.get("timestamp", ""), reverse=True)

def handle_file_upload(file_content, filename):
    r = RedisClient.get_instance()
    file_id = str(uuid.uuid4())
    r.set(f"file:{file_id}", file_content[:5000])
    return {"file_id": file_id, "filename": filename}

def get_notifications(username):
    r = RedisClient.get_instance()
    notifs = r.lrange("notifications", 0, -1)
    data = [json.loads(n) for n in notifs]
    return [n for n in data if n.get("username") == username]

def get_admin_jobs():
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
    jobs.sort(key=lambda x: x.get("completed_at") or "", reverse=True)
    return jobs

def get_admin_workers():
    r = RedisClient.get_instance()
    keys = r.keys("worker_heartbeat:*")
    workers = []
    now = int(time.time())
    for k in keys:
        worker_id = k.split(":")[1]
        last_seen = int(r.get(k))
        workers.append({
            "worker_id": worker_id,
            "last_seen_unix": last_seen,
            "last_seen_iso": datetime.fromtimestamp(last_seen).isoformat(),
            "alive": (now - last_seen) < 30
        })
    return workers

def get_admin_dead_letters():
    r = RedisClient.get_instance()
    dlq_items = r.lrange("dead_letter_queue", 0, -1)
    return [json.loads(item) for item in dlq_items]
