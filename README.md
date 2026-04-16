# AI Workflow Automation Agent

A production-style multi-service AI agent that executes real-world workflows from natural language commands — with async task processing, file analysis, and a modern chat UI.

---

## Features

- Natural Language Workflows — type commands like "Summarize AI trends", "Schedule a meeting", or "Analyze this CSV"
- Intent Detection — automatically routes to the right tool (summarize / scheduler / csv_analysis)
- File Upload and Analysis — upload .txt or .csv files; worker reads and analyzes via OpenAI
- Async Task Queue — Redis-backed queue with background worker processing
- Idempotency — duplicate tasks are detected and skipped
- Password Hashing — SHA-256 hashed credentials
- Notification System — real-time alerts for queued and completed workflows
- Chat UI — dark glass interface with sidebar history, alerts tab, and New Chat button
- Trace IDs — every workflow run is tracked end-to-end

---

## Tech Stack

- Backend API: FastAPI (Python)
- Task Worker: Python (separate Docker service)
- Queue: Redis
- Frontend: HTML / CSS / Vanilla JS
- AI: OpenAI GPT-3.5-turbo
- Infrastructure: Docker Compose

---

## Architecture

    User
     -> Frontend (port 3000)
     -> Backend API (port 8000)
     -> Redis Queue
     -> Worker (polls queue)
     -> OpenAI GPT-3.5
     -> Result saved to Redis
     -> Frontend polls /result/:trace_id

---

## Project Structure

    ai-agent/
    backend/
        main.py
        controllers/
            workflow_controller.py
        models/
            task.py
        services/
            redis_client.py
    worker/
        worker.py
    frontend/
        index.html
    docker-compose.yml
    .env

---

## How to Run

1. Add your OpenAI API key

    echo "OPENAI_API_KEY=sk-..." > .env

2. Start all services

    docker-compose up --build

3. Open the app

    http://localhost:3000

4. Login

    Username: admin
    Password: admin123

---

## API Endpoints

- POST   /login              Authenticate user
- POST   /run-workflow       Queue a workflow command
- GET    /result/{trace_id}  Poll for result
- GET    /logs               All workflow history
- POST   /upload             Upload a file for analysis
- GET    /notifications      Recent notification events

---

## Workflow Tools

- summarize     (default)                        OpenAI GPT summary
- scheduler     schedule, meeting, tomorrow      Returns scheduled confirmation
- csv_analysis  csv, analyze, data, report       Reads uploaded file then GPT analysis

---

## Environment Variables

- OPENAI_API_KEY: Your OpenAI API key

---

## Author

Built by Niraj Kumar — https://github.com/Niraj123kumar
