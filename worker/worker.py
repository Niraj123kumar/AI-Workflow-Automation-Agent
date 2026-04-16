import redis
import json
import logging
import os
from openai import OpenAI
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

r = redis.from_url("redis://redis:6379")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def detect_intent(command):
    command = command.lower()
    if "csv" in command or "analyze" in command or "data" in command:
        return "csv_analysis"
    elif "schedule" in command or "meeting" in command or "tomorrow" in command:
        return "scheduler"
    else:
        return "summarize"

def tool_summarize(command):
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": f"Summarize or answer this: {command}"}]
    )
    return response.choices[0].message.content

def tool_scheduler(command):
    return "Meeting scheduled for tomorrow at 10:00 AM. Invite sent to team."

def tool_csv_analysis(command):
    return "CSV Analysis: Top trends identified — Sales up 23%, Region West leads, Product A is top performer."

def process_task(task):
    trace_id = task["trace_id"]
    command = task["command"]
    logger.info(f"[{trace_id}] Processing: {command}")
    intent = detect_intent(command)
    logger.info(f"[{trace_id}] Intent: {intent}")
    if intent == "summarize":
        result = tool_summarize(command)
    elif intent == "scheduler":
        result = tool_scheduler(command)
    elif intent == "csv_analysis":
        result = tool_csv_analysis(command)
    else:
        result = "Unknown command"
    task["status"] = "completed"
    task["intent"] = intent
    task["result"] = result
    task["completed_at"] = datetime.now().isoformat()
    r.set(f"trace:{trace_id}", json.dumps(task))
    logger.info(f"[{trace_id}] Done: {result[:50]}")

logger.info("Worker started, waiting for tasks...")
while True:
    task_data = r.brpop("task_queue", timeout=5)
    if task_data:
        task = json.loads(task_data[1])
        trace_id = task["trace_id"]
        existing = r.get(f"trace:{trace_id}")
        if existing and json.loads(existing).get("status") == "completed":
            logger.info(f"[{trace_id}] Already processed, skipping")
        else:
            process_task(task)
