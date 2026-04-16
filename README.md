# AI Workflow Automation Agent

## Problem Statement

Build an AI agent that executes real-world workflows from natural language commands.

## Solution

A multi-service agent that detects intent, selects the right tool, and executes workflows asynchronously.

## Tech Stack

- Backend: FastAPI (Python)
- Worker: Python (separate service)
- Queue: Redis
- Frontend: HTML/JS
- AI: OpenAI GPT-3.5
- Infrastructure: Docker Compose

## How to Run

1. Add your OpenAI API key to `.env`
2. Run: `docker-compose up --build`
3. Open: `http://localhost:3000`
4. Login: admin / admin123

## Architecture

User → Frontend → Backend API → Redis Queue → Worker → OpenAI → Result stored → Frontend polls result
