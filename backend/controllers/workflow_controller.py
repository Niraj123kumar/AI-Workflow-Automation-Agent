import json
import uuid
import logging
from datetime import datetime
from services.redis_client import RedisClient

logger = logging.getLogger(__name__)

def queue_workflow(command: str, username: str):
    r = RedisClient.get_instance()
    trace_id = str(uuid.uuid4())
    task = {
        "trace_id": trace_id,
        "command": command,
        "username": username,
        "timestamp": datetime.now().isoformat(),
        "status": "queued"
    }
    r.lpush("task_queue", json.dumps(task))
    r.set(f"trace:{trace_id}", json.dumps(task))
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
    logs = [json.loads(r.get(k)) for k in keys]
    return sorted(logs, key=lambda x: x["timestamp"], reverse=True)
