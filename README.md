# AI Workflow Automation Agent

A production-style multi-service AI agent that executes real-world workflows from natural language commands — with async task processing, file analysis, and a modern chat UI.

---

## Features

- **Natural Language Workflows** — Type commands like "Summarize AI trends", "Schedule a meeting", or "Analyze this CSV".
- **Advanced Intent Detection** — Uses OpenAI Function Calling to route to specific tools: `summarize`, `scheduler`, or `csv_analysis`.
- **File Upload & Analysis** — Upload `.txt`, `.csv`, or `.pdf` files for AI-powered data extraction and summarization.
- **Async Task Queue** — Redis-backed queue with parallel worker processing (2+ worker instances).
- **Security & RBAC** — JWT-based authentication with refresh tokens and Role-Based Access Control (Admin vs. User).
- **Google OAuth2** — Integration for seamless login via Google.
- **Observability** — Prometheus metrics at `/metrics`, Grafana dashboards, and structured JSON logging with Trace IDs.
- **Modern Chat UI** — Dark glass morphism design built with React 18, Vite, and Tailwind CSS.
- **Kubernetes Ready** — Full K8s manifests for Minikube deployment with Horizontal Pod Autoscaling.

---

## Tech Stack

- **Backend**: FastAPI (Python)
- **Worker**: Python (Separate background service)
- **Database/Queue**: Redis
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide React
- **AI**: OpenAI GPT-3.5-turbo (Function Calling)
- **Infrastructure**: Docker Compose, Kubernetes (Minikube)
- **Observability**: Prometheus, Grafana

---

## How to Run (Docker)

1. **Setup Environment**:
   ```bash
   cp .env.example .env
   # Add your OPENAI_API_KEY and other credentials
   ```

2. **Start Services**:
   ```bash
   docker-compose up --build -d
   ```

3. **Access the App**:
   - Frontend: `http://localhost:3000`
   - Backend API Docs: `http://localhost:8000/docs`
   - Grafana: `http://localhost:3001`
   - Prometheus: `http://localhost:9090`

4. **Default Credentials**:
   - Username: `admin` | Password: `admin123`
   - Username: `user` | Password: `user123`

---

## How to Run (Kubernetes)

Refer to [README-k8s.md](./README-k8s.md) for full Minikube deployment instructions.

---

## API Endpoints

- `POST /auth/login` — Authenticate and issue JWT.
- `POST /auth/register` — Create new user.
- `GET /auth/google` — Google OAuth2 login.
- `POST /run-workflow` — Queue a workflow command (JWT required).
- `GET /result/{trace_id}` — Poll for task results.
- `GET /admin/jobs` — View all system jobs (Admin only).
- `GET /metrics` — Prometheus metrics.

---


