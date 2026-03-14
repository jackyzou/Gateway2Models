/**
 * Gateway2Models MCP Server
 *
 * Exposes G2M as an MCP (Model Context Protocol) tool server.
 * Agents in Claude Code, Cursor, Copilot, etc. can discover and use
 * G2M natively through the MCP protocol over stdio.
 *
 * Usage:
 *   node dist/mcp-server.js
 *
 * Add to .vscode/mcp.json:
 *   { "servers": { "g2m": { "command": "node", "args": ["path/to/dist/mcp-server.js"], "type": "stdio" } } }
 */

import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

const G2M_BASE = process.env.G2M_BASE_URL ?? "http://127.0.0.1:5555";

// ── MCP Protocol Types ───────────────────────────────────────────────

interface McpRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface McpNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// ── Tool Definitions ─────────────────────────────────────────────────

const TOOLS = [
  {
    name: "g2m_chat",
    description: "Send a chat completion request to Gateway2Models. Supports auto-routing across multiple AI backends (Claude, Agency, Copilot, Ollama).",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", description: "Model to use: auto, vscode-claude, agency-claude, agency-copilot, ollama", default: "auto" },
        message: { type: "string", description: "The user message to send" },
        system: { type: "string", description: "Optional system prompt" },
      },
      required: ["message"],
    },
  },
  {
    name: "g2m_context_load",
    description: "Load file contents from any directory on the machine. Returns file content, line count, and size.",
    inputSchema: {
      type: "object",
      properties: {
        paths: { type: "array", items: { type: "string" }, description: "File or directory paths to load" },
        maxTotalSize: { type: "number", description: "Max total bytes to load (default: 500000)" },
      },
      required: ["paths"],
    },
  },
  {
    name: "g2m_project_discover",
    description: "Auto-detect project type, tech stack, entry files, and configuration from a directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Root directory of the project" },
      },
      required: ["path"],
    },
  },
  {
    name: "g2m_git_diff",
    description: "Get recent git changes (diff, modified files, commit history) from a repository.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to git repository" },
        commits: { type: "number", description: "Number of recent commits to include (default: 3)" },
      },
      required: ["path"],
    },
  },
  {
    name: "g2m_list_models",
    description: "List all available AI models and backends in Gateway2Models.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "g2m_generate_image",
    description: "Generate images from a text prompt using available providers (Stability AI, DALL-E, local ComfyUI).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Image description" },
        size: { type: "string", enum: ["256x256", "512x512", "1024x1024"], default: "1024x1024" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "g2m_router_stats",
    description: "Get routing analytics: per-backend request counts, latency, token usage, and cost estimates.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ── G2M HTTP Client ──────────────────────────────────────────────────

async function g2mFetch(path: string, body?: unknown): Promise<unknown> {
  const opts: RequestInit = {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${G2M_BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`G2M ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Tool Execution ───────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "g2m_chat": {
      const messages: { role: string; content: string }[] = [];
      if (args.system) messages.push({ role: "system", content: String(args.system) });
      messages.push({ role: "user", content: String(args.message) });
      const result = await g2mFetch("/v1/chat/completions", {
        model: args.model ?? "auto",
        messages,
      });
      const resp = result as { choices: { message: { content: string } }[] };
      return resp.choices[0]?.message.content ?? "";
    }

    case "g2m_context_load":
      return g2mFetch("/v1/context/load", {
        paths: args.paths,
        maxTotalSize: args.maxTotalSize ?? 500000,
      });

    case "g2m_project_discover":
      return g2mFetch("/v1/context/discover", { path: args.path });

    case "g2m_git_diff":
      return g2mFetch("/v1/context/git-diff", {
        path: args.path,
        commits: args.commits ?? 3,
      });

    case "g2m_list_models":
      return g2mFetch("/v1/models");

    case "g2m_generate_image":
      return g2mFetch("/v1/images/generations", {
        prompt: args.prompt,
        size: args.size ?? "1024x1024",
      });

    case "g2m_router_stats":
      return g2mFetch("/v1/router/stats");

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP Message Handler ──────────────────────────────────────────────

async function handleMessage(msg: McpRequest): Promise<McpResponse> {
  try {
    switch (msg.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: {
              name: "gateway2models",
              version: "4.0.0",
            },
          },
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id: msg.id,
          result: { tools: TOOLS },
        };

      case "tools/call": {
        const params = msg.params as { name: string; arguments: Record<string, unknown> };
        const content = await executeTool(params.name, params.arguments ?? {});
        return {
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            content: [
              {
                type: "text",
                text: typeof content === "string" ? content : JSON.stringify(content, null, 2),
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32601, message: `Method not found: ${msg.method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ── Stdio Transport ──────────────────────────────────────────────────

function send(data: McpResponse | McpNotification): void {
  const json = JSON.stringify(data);
  process.stdout.write(json + "\n");
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  if (!line.trim()) return;

  try {
    const msg = JSON.parse(line) as McpRequest;

    // Handle notifications (no id)
    if (!("id" in msg)) {
      // notifications/initialized — acknowledge
      return;
    }

    const response = await handleMessage(msg);
    send(response);
  } catch {
    // Malformed JSON — ignore
  }
});

rl.on("close", () => {
  process.exit(0);
});

// Signal that we're ready
process.stderr.write("[G2M MCP Server] Ready on stdio\n");
