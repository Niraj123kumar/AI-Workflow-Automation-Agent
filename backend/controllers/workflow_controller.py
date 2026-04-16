import json
import uuid
import logging
from datetime import datetime

from redis.exceptions import RedisError

from services.redis_client import RedisClient

logger = logging.getLogger(__name__)


def queue_workflow(command: str, username: str) -> str:
    r = RedisClient.get_instance()
    trace_id = str(uuid.uuid4())
    task = {
        "trace_id": trace_id,
        "command": command,
        "username": username,
        "timestamp": datetime.now().isoformat(),
        "status": "queued",
    }
    payload = json.dumps(task)
    r.lpush("task_queue", payload)
    r.set(f"trace:{trace_id}", payload)
    logger.info(f"[{trace_id}] Task queued: {command}")
    return trace_id


def get_result(trace_id: str):
    r = RedisClient.get_instance()
    data = r.get(f"trace:{trace_id}")
    if not data:
        return None
    try:
        return json.loads(data)
    except (ValueError, TypeError) as exc:
        logger.error(f"[{trace_id}] Corrupt trace payload: {exc}")
        return None


def get_all_logs():
    r = RedisClient.get_instance()
    keys = r.keys("trace:*")
    logs = []
    for k in keys:
        try:
            raw = r.get(k)
            if raw is None:
                continue
            logs.append(json.loads(raw))
        except (ValueError, TypeError, RedisError) as exc:
            logger.warning(f"Skipping malformed log entry {k!r}: {exc}")
            continue
    return sorted(logs, key=lambda x: x.get("timestamp", ""), reverse=True)
