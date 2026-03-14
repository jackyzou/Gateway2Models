# ⚡ Gateway2Models

**Local AI model gateway — agentware for multi-model orchestration.**

Gateway2Models is a localhost-first agentware server that exposes an **OpenAI-compatible API** and intelligently routes requests across multiple AI backends. Built for agents, automations, and developers who need unified access to multiple AI models from a single endpoint.

```
http://127.0.0.1:5555/v1/chat/completions
```

## Why

You have multiple AI model access points — VS Code Claude CLI, Agency Claude, Agency Copilot — each with different strengths, auth mechanisms, and use cases. Instead of hardcoding which model to call, Gateway2Models provides:

- **One API** for all backends (OpenAI-compatible — works with any SDK)
- **Smart routing** that picks the right backend based on your prompt
- **File context loading** from any directory on the machine
- **Parallel sessions** to fan-out requests to multiple models simultaneously
- **Dynamic effort** tuning for complex vs simple tasks

## Quick Start

```bash
npm install
npm run build
npm start          # http://127.0.0.1:5555
# or
npm run dev        # development with hot reload
```

Open **http://localhost:5555** for the web UI, or point any OpenAI-compatible client at `http://localhost:5555/v1`.

## Backends

| Model ID | Backend | Model | Best For |
|----------|---------|-------|----------|
| `vscode-claude` | Claude CLI | Opus 4.6 (1M ctx) | General coding, Q&A, fast inference |
| `agency-claude` | Agency CLI | Opus 4.6 (1M ctx) | Complex tasks, dynamic effort level |
| `agency-copilot` | Copilot CLI | GitHub Copilot | Microsoft ecosystem (ADO, WorkIQ, M365) |
| `auto` | Smart Router | — | **Recommended.** Auto-picks based on content |

## API

### Chat Completions
```bash
curl http://localhost:5555/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Explain TypeScript generics"}],
    "stream": true
  }'
```

### Load File Context (any directory)
```bash
# Read a file
curl http://localhost:5555/v1/context/read \
  -H "Content-Type: application/json" \
  -d '{"path": "C:\\Users\\project\\src\\main.ts"}'

# List directory
curl http://localhost:5555/v1/context/list \
  -H "Content-Type: application/json" \
  -d '{"path": "C:\\Users\\project", "recursive": true}'

# Bulk load context
curl http://localhost:5555/v1/context/load \
  -H "Content-Type: application/json" \
  -d '{"paths": ["C:\\Users\\project\\src", "C:\\docs\\spec.md"]}'
```

### Parallel Sessions
```bash
curl http://localhost:5555/v1/sessions/parallel \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {"model": "vscode-claude", "messages": [{"role":"user","content":"Review this code"}]},
      {"model": "agency-claude", "messages": [{"role":"user","content":"Find security issues"}]}
    ],
    "concurrency": 3
  }'
```

### Python (OpenAI SDK)
```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:5555/v1", api_key="unused")
response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)
for chunk in response:
    print(chunk.choices[0].delta.content or "", end="")
```

## Smart Routing

When `model: "auto"`, the gateway analyzes your prompt to pick the best backend:

| Signal | Score | Routes To |
|--------|-------|-----------|
| MSFT keywords (Azure DevOps, WorkIQ, M365, Teams) | Strong: +3, Weak: +1 | `agency-copilot` (threshold: 2) |
| Complex tasks (architecture, refactor, multi-file) | +2 per signal | `agency-claude` (threshold: 4) |
| Long prompts (>1500 chars), code blocks, multi-turn | +1-3 | `agency-claude` |
| Simple/quick tasks | -1 per signal | `vscode-claude` (default) |

Routing decisions are logged and returned in the `x-routing` response field.

## Effort Levels

For `agency-claude`, effort is auto-classified:

| Level | Prompt Signals |
|-------|---------------|
| **low** | Short (<100 chars), "quick", "brief", "tl;dr" |
| **medium** | Standard (100-500 chars), general questions |
| **high** | "analyze", "review", "debug", "detailed" (500-2000 chars) |
| **max** | "architecture", "comprehensive", "deep dive" (>2000 chars) |

Override: `"x-effort": "max"` in request body or `x-effort: max` header.

## Architecture

```
Agents/Apps ──→ Gateway2Models (localhost:5555)
                  ├── Smart Router (score-based classification)
                  │     ├── MSFT keywords → Agency Copilot (MCP tools)
                  │     ├── Complex tasks → Agency Claude (dynamic effort)
                  │     └── Default → VS Code Claude (fast)
                  ├── File Context Loader (any directory access)
                  ├── Parallel Session Manager (fan-out execution)
                  └── Web UI (human testing at /)
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web UI for testing |
| `/health` | GET | Server status |
| `/v1/models` | GET | List models |
| `/v1/chat/completions` | POST | Chat (OpenAI-compatible) |
| `/v1/context/read` | POST | Read a file |
| `/v1/context/list` | POST | List directory |
| `/v1/context/glob` | POST | Find files by extension |
| `/v1/context/load` | POST | Bulk load file context |
| `/v1/sessions/parallel` | POST | Run parallel model requests |
| `/v1/sessions` | GET | List sessions |
| `/v1/sessions/:id` | GET | Get session details |

## Agent Integration

See [**AGENTS.md**](AGENTS.md) for the full agent integration guide with patterns, examples, and best practices.

## For Agents: Key Points

1. **Use `model: "auto"`** — the router is smart, let it pick
2. **Load context first** — `/v1/context/load` then include files in your system prompt
3. **Use parallel sessions** for multi-perspective analysis
4. **Stream long responses** — `"stream": true` for real-time output
5. **Check `x-routing`** in responses to see why a backend was chosen

## Configuration

Edit `src/config.ts`:
- Port (default: 5555)
- CLI paths (auto-detected for current machine)
- Timeout (default: 5 minutes)
- Max concurrency (default: 5)

## License

MIT
