# Gateway2Models — Agent Integration Guide

> **For AI agents and automated systems** that want to use Gateway2Models as their model backend.

## Quick Start

**Base URL:** `http://127.0.0.1:5555`

Gateway2Models is an OpenAI-compatible local gateway with **persistent agent memory**. Agents register once, and G2M remembers their skills, context, and conversation history across sessions.

The recommended flow for agents:
1. **Intake** → Register with G2M (once), describe skills, workspace, and goals
2. **Chat** → Use thread-aware chat to get context-enriched responses with history
3. **Context** → Load files from any directory to enrich prompts
4. **Parallel** → Fan-out analysis across multiple models

---

## 1. Chat Completions

**Endpoint:** `POST /v1/chat/completions`

This is the primary endpoint. It's fully compatible with the OpenAI Chat Completions API.

### Basic Request
```json
{
  "model": "auto",
  "messages": [
    {"role": "system", "content": "You are a helpful coding assistant."},
    {"role": "user", "content": "Write a TypeScript function to reverse a string."}
  ]
}
```

### With Streaming (SSE)
```json
{
  "model": "auto",
  "messages": [{"role": "user", "content": "Explain async/await"}],
  "stream": true
}
```

### Available Models

| Model ID | When to Use |
|----------|-------------|
| `auto` | **Recommended.** Gateway auto-routes based on prompt content analysis. |
| `vscode-claude` | General-purpose coding, Q&A, explanations. Fast. |
| `agency-claude` | Complex multi-step tasks, architecture, refactoring. Dynamic effort. |
| `agency-copilot` | Microsoft ecosystem only (ADO, WorkIQ, M365, Teams, SharePoint). |

### Effort Control

For `agency-claude`, effort level is auto-detected from prompt complexity. Override with:

```json
{ "x-effort": "max" }
```

Or via HTTP header: `x-effort: high`

| Level | Use When |
|-------|----------|
| `low` | Quick questions, yes/no, simple lookups |
| `medium` | Standard coding questions, explanations |
| `high` | Code review, debugging, multi-step analysis |
| `max` | Architecture design, full implementations, deep dives |

### Auto-Routing Logic

When `model: "auto"`:
1. **MSFT keywords detected** (ADO, Azure DevOps, WorkIQ, M365, Teams, etc.) → `agency-copilot`
2. **Complex task signals** (multi-file, architecture, refactor, security audit) → `agency-claude`
3. **Default** → `vscode-claude`

The response includes routing metadata in `x-routing`:
```json
{
  "x-routing": {
    "backend": "vscode-claude",
    "confidence": 0.7,
    "reason": "Default routing (complexity: 1, msft: 0)",
    "effort": "medium"
  }
}
```

---

## 2. File Context Loading

Agents can load file content from **any directory** on the machine to provide context for prompts.

### Read a Single File
```
POST /v1/context/read
{
  "path": "C:\\Users\\jiaqizou\\project\\src\\main.ts",
  "startLine": 1,
  "endLine": 100
}
```

### List Directory Contents
```
POST /v1/context/list
{
  "path": "C:\\Users\\jiaqizou\\project",
  "recursive": true,
  "maxDepth": 3
}
```

### Find Files by Extension
```
POST /v1/context/glob
{
  "directory": "C:\\Users\\jiaqizou\\project",
  "extensions": [".ts", ".tsx", ".js"],
  "maxFiles": 50
}
```

### Bulk Load Context (files + directories)
```
POST /v1/context/load
{
  "paths": [
    "C:\\Users\\jiaqizou\\project1\\src",
    "C:\\Users\\jiaqizou\\project2\\main.py",
    "C:\\Users\\jiaqizou\\project3\\README.md"
  ],
  "maxTotalSize": 500000
}
```

Returns an array of file contents with path, content, line count, and size.

### Agent Pattern: Load Context → Ask Question

```python
import requests

# Step 1: Load relevant files
ctx = requests.post("http://localhost:5555/v1/context/load", json={
    "paths": ["C:\\Users\\jiaqizou\\myapp\\src"]
}).json()

# Step 2: Build context-enriched prompt
file_context = "\n\n".join(
    f"### {f['path']}\n```\n{f['content']}\n```"
    for f in ctx["files"]
)

# Step 3: Ask the model with full context
response = requests.post("http://localhost:5555/v1/chat/completions", json={
    "model": "auto",
    "messages": [
        {"role": "system", "content": f"Project files:\n{file_context}"},
        {"role": "user", "content": "Find potential bugs in this codebase"}
    ]
}).json()
```

---

## 3. Parallel Sessions

Run multiple model requests simultaneously, each potentially targeting different backends.

### Request
```
POST /v1/sessions/parallel
{
  "tasks": [
    {
      "model": "vscode-claude",
      "messages": [{"role": "user", "content": "Summarize this code"}]
    },
    {
      "model": "agency-claude",
      "messages": [{"role": "user", "content": "Find security issues"}],
      "x-effort": "high"
    },
    {
      "model": "agency-copilot",
      "messages": [{"role": "user", "content": "Check my ADO work items"}]
    }
  ],
  "concurrency": 3
}
```

### Response
```json
{
  "id": "session-uuid",
  "status": "completed",
  "tasks": [
    {
      "id": "task-uuid",
      "model": "vscode-claude",
      "status": "completed",
      "result": { /* OpenAI ChatCompletion response */ },
      "startedAt": 1710000000000,
      "completedAt": 1710000005000
    },
    ...
  ]
}
```

### List Sessions
```
GET /v1/sessions
GET /v1/sessions/:id
```

### Agent Pattern: Fan-Out Analysis

```python
# Analyze same code from 3 perspectives simultaneously
response = requests.post("http://localhost:5555/v1/sessions/parallel", json={
    "tasks": [
        {"model": "vscode-claude", "messages": [{"role":"user","content": "Review code style: " + code}]},
        {"model": "agency-claude", "messages": [{"role":"user","content": "Find bugs: " + code}], "x-effort": "high"},
        {"model": "vscode-claude", "messages": [{"role":"user","content": "Suggest optimizations: " + code}]},
    ],
    "concurrency": 3
}).json()

for task in response["tasks"]:
    print(f"[{task['model']}] {task['result']['choices'][0]['message']['content'][:200]}")
```

---

## 4. Agent Intake & Persistent Memory

The **Agent Intake Protocol** is what makes G2M an agentware platform. When an agent first connects, it tells G2M:
- **Who it is** — name, skills, tech stack
- **What it's working on** — workspace path, project description
- **What it needs** — current task, goals, files to load
- **How it prefers responses** — model preference, effort level, system prompt

G2M remembers all of this in `~/.g2m/agents/` and uses it to enrich every subsequent request.

### Step 1: Register via Intake

```
POST /v1/agents/intake
{
  "agentId": "my-code-reviewer",
  "name": "Code Review Agent",
  "description": "Reviews code for bugs, style, and security issues",
  "skills": ["code-review", "security-analysis", "typescript"],
  "techStack": ["TypeScript", "Node.js", "React"],
  "workspace": {
    "path": "C:\\Users\\dev\\myproject",
    "description": "E-commerce platform backend",
    "keyPaths": ["src/api/", "src/models/", "tests/"]
  },
  "goals": ["Find security vulnerabilities", "Improve test coverage"],
  "task": "Review the authentication middleware for JWT validation issues",
  "contextPaths": ["C:\\Users\\dev\\myproject\\src\\middleware\\auth.ts"],
  "preferredModel": "agency-claude",
  "preferredEffort": "high",
  "systemPrompt": "You are a senior security engineer. Focus on OWASP Top 10."
}
```

**Response includes:**
- `agent` — The persisted agent profile
- `threadId` — A new conversation thread ID
- `loadedContext` — Files that were pre-loaded
- `understanding` — G2M's structured understanding of the agent:
  - `agentSummary` — Who the agent is
  - `taskSummary` — What needs to be done
  - `contextSummary` — What file context is available
  - `recommendations` — Suggestions for better responses
- `isReturning` — Whether this agent has connected before
- `previousWork` — Summaries of previous conversation threads

### Step 2: Chat with Thread Memory

```
POST /v1/agents/chat
{
  "agentId": "my-code-reviewer",
  "threadId": "abc123",
  "message": "Now review the password hashing in src/utils/crypto.ts",
  "contextPaths": ["C:\\Users\\dev\\myproject\\src\\utils\\crypto.ts"]
}
```

G2M automatically:
1. Loads the agent's profile (skills, goals, system prompt)
2. Loads the thread's conversation history (last 40 messages)
3. Loads any additional file context
4. Builds a context-enriched prompt for the model
5. Persists the response back to the thread

### Step 3: Resume Later

When the agent reconnects (even from a different session):
```
POST /v1/agents/intake
{
  "agentId": "my-code-reviewer",
  "name": "Code Review Agent", 
  "task": "Continue the security review",
  "resumeThreadId": "abc123"
}
```

G2M returns `isReturning: true` with `previousWork` showing all past threads.

### Agent Management Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/agents/intake` | POST | Register agent + create/resume thread |
| `/v1/agents/chat` | POST | Thread-aware chat with memory |
| `/v1/agents` | GET | List all registered agents |
| `/v1/agents/:id` | GET | Get agent profile + threads |
| `/v1/agents/:id` | PUT | Update agent profile |
| `/v1/agents/:id/threads` | GET | List threads (?state=active) |
| `/v1/agents/:id/threads` | POST | Create a new thread |
| `/v1/agents/:agentId/threads/:threadId` | GET | Get thread with full history |
| `/v1/agents/:agentId/threads/:threadId` | PUT | Update thread (summary, goal, state) |

### Agent Pattern: Full Lifecycle

```python
import requests

BASE = "http://localhost:5555"

# 1. Register and get a thread
intake = requests.post(f"{BASE}/v1/agents/intake", json={
    "agentId": "my-agent",
    "name": "My Analysis Agent",
    "skills": ["code-analysis", "performance"],
    "workspace": {"path": "C:\\myproject"},
    "task": "Optimize the database queries",
    "contextPaths": ["C:\\myproject\\src\\db"],
}).json()

thread_id = intake["threadId"]
print(f"Thread: {thread_id}, Returning: {intake['isReturning']}")
print(f"Recommendations: {intake['understanding']['recommendations']}")

# 2. Chat with context
resp = requests.post(f"{BASE}/v1/agents/chat", json={
    "agentId": "my-agent",
    "threadId": thread_id,
    "message": "Which queries are doing full table scans?",
}).json()
print(resp["choices"][0]["message"]["content"])

# 3. Follow-up (history is automatic)
resp2 = requests.post(f"{BASE}/v1/agents/chat", json={
    "agentId": "my-agent",
    "threadId": thread_id,
    "message": "Show me how to add an index to fix the worst one",
    "contextPaths": ["C:\\myproject\\src\\db\\migrations"],
}).json()
print(resp2["choices"][0]["message"]["content"])

# 4. Archive when done
requests.put(f"{BASE}/v1/agents/my-agent/threads/{thread_id}", json={
    "state": "archived",
    "summary": "Identified 3 slow queries, added indexes for users and orders tables",
})
```

### Data Storage

All agent data is stored locally in `~/.g2m/agents/`:
```
~/.g2m/
  agents/
    my-agent/
      profile.json          # Agent skills, goals, preferences
      threads/
        abc123.json          # Conversation with full message history
        def456.json          # Another conversation thread
```

---

## 5. SDK Integration

### Python (OpenAI SDK)
```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:5555/v1", api_key="unused")

# Streaming
for chunk in client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
):
    print(chunk.choices[0].delta.content or "", end="")
```

### JavaScript/TypeScript
```typescript
const response = await fetch("http://localhost:5555/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "auto",
    messages: [{ role: "user", content: "Hello!" }],
  }),
});
const data = await response.json();
console.log(data.choices[0].message.content);
```

### curl
```bash
curl http://localhost:5555/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'
```

---

## 6. Health & Discovery

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status, active request count |
| `/v1/models` | GET | List all available model aliases with descriptions |
| `/v1/sessions` | GET | List all parallel sessions |
| `/v1/agents` | GET | List all registered agents |
| `/` | GET | Web UI for manual testing |

---

## 7. Best Practices for Agents

1. **Always start with intake** — Call `/v1/agents/intake` first to register your identity and get a thread
2. **Use `model: "auto"`** unless you have a specific reason to target a backend
3. **Provide rich intake data** — The more G2M knows about your skills, workspace, and goals, the better it routes and responds
4. **Use thread-aware chat** — `/v1/agents/chat` persists history automatically, so follow-up questions have full context
5. **Load context first** — Include `contextPaths` in intake or chat to pre-load relevant files
6. **Archive completed threads** — Update thread state to `"archived"` and add a summary when a task is done
7. **Reuse your agentId** — Returning agents get their full profile and previous work history
8. **Use parallel sessions** for multi-perspective analysis (code review + security + perf)
9. **Check routing metadata** — the `x-routing` field tells you which backend was chosen and why
10. **Respect concurrency limits** — the gateway returns 429 if too many concurrent requests

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Agent / Application (any project)           │
│     1. Intake: register skills, workspace, goals        │
│     2. Chat:   thread-aware with persistent memory      │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP (localhost:5555)
┌────────────────────▼────────────────────────────────────┐
│                   Gateway2Models                         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Agent Memory (~/.g2m/agents/)                     │   │
│  │  • Agent profiles (skills, goals, preferences)    │   │
│  │  • Conversation threads (full history + routing)  │   │
│  │  • Context accumulation across sessions           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Smart Router (score-based classification)        │   │
│  │  • MSFT keyword scoring → Agency Copilot          │   │
│  │  • Complexity scoring → Agency Claude             │   │
│  │  • Default → VS Code Claude                       │   │
│  └──────────┬──────────────┬──────────────┬─────────┘   │
│             │              │              │              │
│  ┌──────────▼──┐  ┌───────▼───────┐  ┌──▼──────────┐   │
│  │ VS Code     │  │ Agency        │  │ Agency      │   │
│  │ Claude CLI  │  │ Claude CLI    │  │ Copilot CLI │   │
│  │ (opus 4.6)  │  │ (opus 4.6)   │  │ (GitHub)    │   │
│  │             │  │ +effort level │  │ +MCP tools  │   │
│  └─────────────┘  └───────────────┘  └─────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  File Context Loader (any directory on machine)   │   │
│  │  Parallel Session Manager (fan-out execution)     │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```
