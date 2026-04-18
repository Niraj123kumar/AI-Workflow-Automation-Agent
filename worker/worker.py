import os
import re
import json
import socket
import logging
import time
import sys
import signal
from datetime import datetime
from openai import OpenAI
import redis
from cryptography.fernet import Fernet
from pythonjsonlogger import jsonlogger

# Structured Logging
logger = logging.getLogger()
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter('%(timestamp)s %(service_name)s %(job_id)s %(event)s %(level)s')
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

# Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
WORKER_ID = socket.gethostname()

r = redis.from_url(REDIS_URL)
client = OpenAI(api_key=OPENAI_API_KEY)
fernet = Fernet(ENCRYPTION_KEY.encode()) if ENCRYPTION_KEY else None

# --- Graceful Shutdown ---
running = True
def handle_exit(sig, frame):
    global running
    logger.info("Worker shutting down cleanly", extra={"service_name": "worker", "event": "shutdown", "worker_id": WORKER_ID})
    running = False
    try:
        r.close()
    except:
        pass
    sys.exit(0)

def decrypt_data(token):
    if not fernet or not token:
        return token
    try:
        return fernet.decrypt(token.encode()).decode()
    except:
        return token

def encrypt_data(data):
    if isinstance(data, dict) or isinstance(data, list):
        return json.dumps(data)
    return str(data)

def log_tool_usage(tool_name, input_tokens, output_tokens, duration_ms, job_id):
    log_entry = {
        "tool_name": tool_name,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "duration_ms": duration_ms,
        "job_id": job_id,
        "timestamp": datetime.now().isoformat()
    }
    # rubric: atomic pipe
    pipe = r.pipeline()
    pipe.lpush("tool_logs", json.dumps(log_entry))
    pipe.ltrim("tool_logs", 0, 199)
    pipe.execute()

def update_heartbeat():
    r.setex(f"worker_heartbeat:{WORKER_ID}", 60, str(int(time.time())))

# Tool Handlers
def handle_csv_analyzer(query, file_id=None, job_id=None):
    start_time = time.time()
    content = ""
    if file_id:
        raw_file = r.get(f"file:{file_id}")
        if raw_file:
            content = raw_file.decode() if isinstance(raw_file, bytes) else raw_file
    
    prompt = f"Analyze this data/query: {query}\n\nContext: {content[:4000]}"
    
    update_heartbeat()
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "system", "content": "You are a data analyst. Return the top 5 trends as a JSON object with a 'trends' key containing a list of {title, description, value} objects."},
                  {"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    update_heartbeat()
    
    duration = int((time.time() - start_time) * 1000)
    log_tool_usage("csv_analyzer", response.usage.prompt_tokens, response.usage.completion_tokens, duration, job_id)
    return response.choices[0].message.content

def handle_meeting_scheduler(raw_command, job_id=None):
    start_time = time.time()
    update_heartbeat()
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "system", "content": "Extract meeting details. Return JSON with keys: title, datetime_iso, attendees (list), description."},
                  {"role": "user", "content": raw_command}],
        response_format={"type": "json_object"}
    )
    update_heartbeat()
    
    duration = int((time.time() - start_time) * 1000)
    log_tool_usage("meeting_scheduler", response.usage.prompt_tokens, response.usage.completion_tokens, duration, job_id)
    return response.choices[0].message.content

def handle_report_summarizer(text, file_id=None, job_id=None):
    start_time = time.time()
    content = text
    if file_id:
        raw_file = r.get(f"file:{file_id}")
        if raw_file:
            content = raw_file.decode() if isinstance(raw_file, bytes) else raw_file
    
    update_heartbeat()
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "system", "content": "Summarize the text. Return JSON with keys: summary, action_items (list)."},
                  {"role": "user", "content": content[:4000]}],
        response_format={"type": "json_object"}
    )
    update_heartbeat()
    
    duration = int((time.time() - start_time) * 1000)
    log_tool_usage("report_summarizer", response.usage.prompt_tokens, response.usage.completion_tokens, duration, job_id)
    return response.choices[0].message.content

tools_config = [
    {
        "type": "function",
        "function": {
            "name": "csv_analyzer",
            "description": "Analyze CSV data or data-related queries",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "file_id": {"type": "string", "description": "Optional file ID if provided in command [file_id:xxx]"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "meeting_scheduler",
            "description": "Schedule a meeting or appointment",
            "parameters": {
                "type": "object",
                "properties": {
                    "raw_command": {"type": "string"}
                },
                "required": ["raw_command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "report_summarizer",
            "description": "Summarize text or a file",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "file_id": {"type": "string", "description": "Optional file ID if provided in command [file_id:xxx]"}
                },
                "required": ["text"]
            }
        }
    }
]

def process_task(task):
    trace_id = task.get("trace_id")
    command = task.get("command")
    username = task.get("username")
    retry_count = task.get("retry_count", 0)
    start_time = time.time()

    logger.info("Task received", extra={"job_id": trace_id, "service_name": "worker", "event": "task_received"})

    try:
        is_mock = not OPENAI_API_KEY or "your_openai_api_key" in OPENAI_API_KEY
        
        if is_mock:
            time.sleep(2)
            if "schedule" in command.lower() or "meeting" in command.lower():
                intent, result = "scheduler", {"title": "Meeting", "datetime_iso": datetime.now().isoformat(), "attendees": ["admin"], "description": command}
            elif "analyze" in command.lower() or "csv" in command.lower():
                intent, result = "csv_analysis", {"trends": [{"title": "Growth", "value": "+10%"}]}
            else:
                intent, result = "summarize", {"summary": f"Summary for: {command}", "action_items": ["Review"]}
        else:
            file_id = None
            if "[file_id:" in command:
                match = re.search(r"\[file_id:([^\]]+)\]", command)
                if match: file_id = match.group(1)

            update_heartbeat()
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": command}],
                tools=tools_config,
                tool_choice="auto"
            )
            update_heartbeat()

            message = response.choices[0].message
            if message.tool_calls:
                tool_call = message.tool_calls[0]
                function_name = tool_call.function.name
                args = json.loads(tool_call.function.arguments)
                if function_name == "csv_analyzer":
                    result, intent = handle_csv_analyzer(args.get("query", command), args.get("file_id") or file_id, trace_id), "csv_analysis"
                elif function_name == "meeting_scheduler":
                    result, intent = handle_meeting_scheduler(args.get("raw_command", command), trace_id), "scheduler"
                elif function_name == "report_summarizer":
                    result, intent = handle_report_summarizer(args.get("text", command), args.get("file_id") or file_id, trace_id), "summarize"
                else: result, intent = "Tool not found", "unknown"
            else:
                result, intent = handle_report_summarizer(command, file_id, trace_id), "summarize"

        end_time = time.time()
        duration_ms = int((end_time - start_time) * 1000)

        task.update({
            "status": "completed",
            "intent": intent,
            "result": result,
            "completed_at": datetime.now().isoformat(),
            "worker_id": WORKER_ID,
            "duration_ms": duration_ms
        })
        
        r.set(f"trace:{trace_id}", json.dumps(task))
        r.publish(f"task_complete:{trace_id}", json.dumps(task))
        logger.info("Task completed", extra={"job_id": trace_id, "service_name": "worker", "event": "task_completed"})

    except Exception as e:
        print(f"ERROR: Task {trace_id} failed: {str(e)}", file=sys.stderr)
        retry_count += 1
        if retry_count < 3:
            task["retry_count"] = retry_count
            r.lpush("task_queue", json.dumps(task))
            logger.warning(f"Task failed, retrying ({retry_count}/3)", extra={"job_id": trace_id})
        else:
            task.update({"status": "DEAD", "error": str(e), "completed_at": datetime.now().isoformat()})
            r.set(f"trace:{trace_id}", json.dumps(task))
            r.lpush("dead_letter_queue", json.dumps(task))
            r.publish(f"task_complete:{trace_id}", json.dumps(task))
            logger.error("Task failed 3 times, moved to DLQ", extra={"job_id": trace_id})

logger.info("Worker started", extra={"service_name": "worker", "event": "worker_startup", "worker_id": WORKER_ID})

while running:
    try:
        task_data = r.brpop("task_queue", timeout=5)
        if task_data:
            task = json.loads(task_data[1])
            trace_id = task.get("trace_id")
            existing = r.get(f"trace:{trace_id}")
            if existing and json.loads(existing).get("status") == "completed":
                continue
            process_task(task)
        update_heartbeat()
    except Exception as e:
        if running: logger.error(f"Worker loop error: {e}")
