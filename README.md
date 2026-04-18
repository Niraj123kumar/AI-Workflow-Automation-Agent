# AI Workflow Automation Agent

A production-grade distributed AI agent system that automates complex business workflows from natural language commands using async task processing and modern observability.

## Problem Statement
Modern enterprises struggle with fragmented automation tools that require technical expertise to bridge. Employees often waste hours manually summarizing reports, scheduling meetings, and analyzing data. This project solves that by providing a unified, secure, natural-language interface that translates human intent into executable background tasks, ensuring high availability and traceability in a distributed environment.

## Solution Architecture
```ascii
[React SPA] → POST /run-workflow → [FastAPI Backend] → LPUSH → [Redis Queue]
                                                                    ↓
[React SPA] ← GET /result/{id} ← [Redis] ← SET trace:{id} ← [Worker 1 / Worker 2]
                                                                    ↓
                                                              [OpenAI API]

[Prometheus] scrapes [Backend :8000/metrics]
[Grafana] reads [Prometheus]
```

## Tech Stack
| Layer | Technology | Version | Why chosen |
|---|---|---|---|
| Frontend | React | 18.x | Industry standard for SPA, robust hooks ecosystem. |
| Build Tool | Vite | 5.x | Instant HMR and lightning-fast production builds. |
| Styling | Tailwind CSS | 3.x | Utility-first CSS for rapid, consistent UI development. |
| Backend | FastAPI | 0.100+ | High performance, async-first, auto-generated OpenAPI docs. |
| Task Queue | Redis | 7.x | Low-latency in-memory store for queuing and state management. |
| AI | OpenAI API | v1 | State-of-the-art LLM with robust function calling capabilities. |
| Monitoring | Prometheus | Latest | Pull-based metrics collection for high-scale observability. |
| Visualization | Grafana | Latest | Powerful dashboards for real-time system monitoring. |

## Quick Start (Local Development)
1. **Clone the repository**:
   ```bash
   git clone https://github.com/Nirajkumar/AI-Workflow-Automation-Agent
   cd AI-Workflow-Automation-Agent
   ```

2. **Setup Environment**:
   ```bash
   cp .env.example .env
   # Open .env and fill in the following:
   # OPENAI_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, 
   # JWT_SECRET, ENCRYPTION_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
   ```

3. **Launch the stack**:
   ```bash
   docker-compose up --build
   ```

4. **Access Endpoints**:
   - **Frontend**:   [http://localhost:3000](http://localhost:3000)
   - **API Docs**:   [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Grafana**:    [http://localhost:3001](http://localhost:3001) (admin/admin)
   - **Prometheus**: [http://localhost:9090](http://localhost:9090)

## Screenshots
- **Login Page**: Modern dark-themed glass morphism login.
- **OTP Screen**: Secure multi-factor authentication flow.
- **Chat with Intent Badge**: Real-time intent classification (Summarize, Scheduler, etc.).
- **Admin Panel**: Global job monitoring and worker heartbeat status.
- **Grafana Dashboard**: Real-time latency, throughput, and queue depth metrics.

## Environment Variables
| KEY | DESCRIPTION | REQUIRED | DEFAULT |
|---|---|---|---|
| `OPENAI_API_KEY` | OpenAI API Key for workflow execution | Yes | - |
| `JWT_SECRET` | Secret key for signing access tokens | Yes | supersecret |
| `REDIS_URL` | Redis connection string | Yes | redis://redis:6379 |
| `ENCRYPTION_KEY` | Fernet key for PII encryption | Yes | - |
| `ALLOWED_ORIGINS` | Comma-separated list of CORS origins | No | http://localhost:3000 |

## API Endpoint Reference
| METHOD | PATH | AUTH REQUIRED | DESCRIPTION |
|---|---|---|---|
| `POST` | `/auth/login` | No | Authenticate user and return JWT tokens. |
| `POST` | `/run-workflow` | Yes | Queue a new natural language workflow. |
| `GET` | `/result/{id}` | No | Poll for the result of a specific job. |
| `GET` | `/health` | No | System health check (pings Redis). |
| `GET` | `/admin/jobs` | Yes (Admin) | List all jobs across the system. |
| `GET` | `/admin/workers` | Yes (Admin) | Monitor active worker heartbeats. |
| `GET` | `/admin/dead-letters`| Yes (Admin) | View failed tasks in Dead Letter Queue. |

## Known Limitations
- **OpenAI Key**: Without a valid `OPENAI_API_KEY`, the system runs in **Mock Mode**, providing simulated responses for "schedule", "analyze", and "summarize" keywords.
- **File Size**: Uploads are currently capped at 5000 characters for analysis to prevent context window overflow.
- **Persistence**: Redis data is persisted in a Docker volume, but logs are stored in-memory.
