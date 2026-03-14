# Gateway2Models — Agent Integration Guide

> **For AI agents and automated systems** that want to use Gateway2Models as their model backend.

## Quick Start

**Base URL:** `http://127.0.0.1:5555`

Gateway2Models is an OpenAI-compatible local gateway. Any tool that speaks the OpenAI API can use it by pointing `base_url` to `http://127.0.0.1:5555/v1`.

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

## 4. SDK Integration

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

## 5. Health & Discovery

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status, active request count |
| `/v1/models` | GET | List all available model aliases with descriptions |
| `/v1/sessions` | GET | List all parallel sessions |
| `/` | GET | Web UI for manual testing |

---

## 6. Best Practices for Agents

1. **Use `model: "auto"`** unless you have a specific reason to target a backend
2. **Load context first** via `/v1/context/load` before asking code questions
3. **Use parallel sessions** for multi-perspective analysis (code review + security + perf)
4. **Let effort auto-detect** — the classifier analyzes your prompt length and keywords
5. **Stream for long responses** — set `"stream": true` to get tokens as they arrive
6. **Check routing metadata** — the `x-routing` field tells you which backend was chosen and why
7. **Respect concurrency limits** — the gateway returns 429 if too many concurrent requests

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Agent / Application                   │
│              (any OpenAI-compatible client)              │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP (localhost:5555)
┌────────────────────▼────────────────────────────────────┐
│                   Gateway2Models                         │
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
