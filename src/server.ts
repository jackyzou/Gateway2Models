import express from "express";
import { CONFIG } from "./config.js";
import { listModels, route } from "./router.js";
import { handleNonStreaming, handleStreaming } from "./streaming.js";
import { ChatCompletionRequestSchema, extractTextContent } from "./types.js";
import {
  readFileContent,
  listDirectory,
  globFiles,
  loadContext,
  ReadFileRequestSchema,
  ListDirRequestSchema,
  GlobFilesRequestSchema,
  LoadContextRequestSchema,
} from "./context-loader.js";
import {
  createParallelSession,
  getSession,
  listSessions,
  ParallelRequestSchema,
} from "./sessions.js";
import { UI_HTML } from "./ui.js";
import {
  AgentProfileSchema,
  registerAgent,
  getAgent,
  updateAgent,
  listAgents,
  listThreads,
  getThread,
  createThread,
  updateThreadMeta,
} from "./agent-memory.js";
import {
  processIntake,
  IntakeRequestSchema,
  ThreadChatRequestSchema,
  buildThreadChatRequest,
  persistResponse,
} from "./agent-intake.js";
import {
  loadStats,
  startStatsPersistence,
  recordRoute,
  getStats,
} from "./router-intelligence.js";
import { loadPolicy, getPolicy, applyPolicy } from "./routing-policy.js";
import { getGitDiff, discoverProject } from "./context-enhanced.js";
import { getCached, setCache, getCacheStats, clearCache, configureQueue } from "./cache-queue.js";
import {
  loadTools,
  registerTool,
  listTools,
  removeTool,
  ToolDefinitionSchema,
} from "./tool-registry.js";
import {
  generateImages,
  ImageGenRequestSchema,
  transcribeAudio,
  AudioTranscriptionSchema,
  createVideoJob,
  getVideoJob,
  listVideoJobs,
  VideoGenRequestSchema,
} from "./generation.js";
import {
  loadLanPolicy,
  getLanPolicy,
  saveLanPolicy,
  lanGuardMiddleware,
  getBindAddress,
  isLanMode,
} from "./lan-gateway.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "10mb" })); // Increased for image/audio uploads

// LAN gateway middleware (applies IP filtering when in LAN mode)
if (isLanMode()) {
  loadLanPolicy().catch(() => {});
  app.use(lanGuardMiddleware());
  console.log("[gateway] LAN mode enabled — binding to 0.0.0.0");
}

// Startup initialization
loadStats().catch(() => {});
startStatsPersistence();
loadPolicy().catch(() => {});
loadTools().catch(() => {});
configureQueue({ maxConcurrency: CONFIG.maxConcurrency });

// ── Concurrency limiter ──────────────────────────────────────────────

let activeRequests = 0;

function acquireSlot(): boolean {
  if (activeRequests >= CONFIG.maxConcurrency) return false;
  activeRequests++;
  return true;
}

function releaseSlot(): void {
  activeRequests = Math.max(0, activeRequests - 1);
}

// ── Web UI ───────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(UI_HTML);
});

// ── Health check ─────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", activeRequests, maxConcurrency: CONFIG.maxConcurrency });
});

// ── Router stats ─────────────────────────────────────────────────────

app.get("/v1/router/stats", (_req, res) => {
  res.json(getStats());
});

// ── List models ──────────────────────────────────────────────────────

app.get("/v1/models", (_req, res) => {
  const models = listModels();
  res.json({
    object: "list",
    data: models.map((m) => ({
      id: m.id,
      object: "model",
      created: 0,
      owned_by: "gateway2models",
      meta: { backend: m.backend, description: m.description },
    })),
  });
});

// ── File context endpoints (for agents) ──────────────────────────────

app.post("/v1/context/read", async (req, res) => {
  const parsed = ReadFileRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const result = await readFileContent(parsed.data.path, parsed.data.startLine, parsed.data.endLine);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

app.post("/v1/context/list", async (req, res) => {
  const parsed = ListDirRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const result = await listDirectory(
      parsed.data.path, parsed.data.recursive, parsed.data.maxDepth, parsed.data.includeHidden,
    );
    res.json({ path: parsed.data.path, entries: result });
  } catch (err) {
    res.status(400).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

app.post("/v1/context/glob", async (req, res) => {
  const parsed = GlobFilesRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const result = await globFiles(
      parsed.data.directory, parsed.data.extensions, parsed.data.maxFiles, parsed.data.maxDepth,
    );
    res.json({ files: result, count: result.length });
  } catch (err) {
    res.status(400).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

app.post("/v1/context/load", async (req, res) => {
  const parsed = LoadContextRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const results = await loadContext(parsed.data.paths, parsed.data.maxTotalSize);
    res.json({ files: results, count: results.length, totalSize: results.reduce((s, f) => s + f.size, 0) });
  } catch (err) {
    res.status(400).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

// ── Parallel sessions ────────────────────────────────────────────────

app.post("/v1/sessions/parallel", async (req, res) => {
  const parsed = ParallelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const session = await createParallelSession(parsed.data);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

app.get("/v1/sessions", (_req, res) => {
  res.json({ sessions: listSessions() });
});

app.get("/v1/sessions/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: { message: "Session not found" } });
    return;
  }
  res.json(session);
});

// ── Agent Intake & Memory ────────────────────────────────────────────

app.post("/v1/agents/intake", async (req, res) => {
  const parsed = IntakeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid intake request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const result = await processIntake(parsed.data);
    console.log(
      `[gateway] Agent intake: ${result.agent.name} (${result.agent.agentId}) | returning=${result.isReturning} | thread=${result.threadId} | files=${result.loadedContext.files.length}`,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

app.get("/v1/agents", async (_req, res) => {
  const agents = await listAgents();
  res.json({ agents });
});

app.get("/v1/agents/:id", async (req, res) => {
  const agent = await getAgent(req.params.id);
  if (!agent) { res.status(404).json({ error: { message: "Agent not found" } }); return; }
  const threads = await listThreads(agent.agentId);
  res.json({ agent, threads });
});

app.put("/v1/agents/:id", async (req, res) => {
  const parsed = AgentProfileSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid update", details: parsed.error.flatten() } });
    return;
  }
  try {
    const agent = await updateAgent(req.params.id, parsed.data);
    res.json({ agent });
  } catch (err) {
    res.status(404).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

app.get("/v1/agents/:id/threads", async (req, res) => {
  const state = req.query.state as "active" | "archived" | undefined;
  const threads = await listThreads(req.params.id, state);
  res.json({ threads });
});

app.post("/v1/agents/:id/threads", async (req, res) => {
  const schema = z.object({ title: z.string().optional(), goal: z.string().optional(), contextPaths: z.array(z.string()).default([]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const thread = await createThread(req.params.id, parsed.data);
    res.json(thread);
  } catch (err) {
    res.status(400).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

app.get("/v1/agents/:agentId/threads/:threadId", async (req, res) => {
  const thread = await getThread(req.params.agentId, req.params.threadId);
  if (!thread) { res.status(404).json({ error: { message: "Thread not found" } }); return; }
  res.json(thread);
});

app.put("/v1/agents/:agentId/threads/:threadId", async (req, res) => {
  const schema = z.object({ title: z.string().optional(), summary: z.string().optional(), goal: z.string().optional(), state: z.enum(["active", "archived"]).optional(), contextPaths: z.array(z.string()).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const thread = await updateThreadMeta(req.params.agentId, req.params.threadId, parsed.data);
    res.json(thread);
  } catch (err) {
    res.status(404).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

// ── Thread-Aware Chat (agent memory + context) ───────────────────────

app.post("/v1/agents/chat", async (req, res) => {
  const parsed = ThreadChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }

  if (!acquireSlot()) {
    res.status(429).json({ error: { message: `Too many concurrent requests (max ${CONFIG.maxConcurrency})` } });
    return;
  }

  const ac = new AbortController();
  res.on("close", () => { if (!res.writableFinished) ac.abort(); });

  try {
    const { messages, model, effort, agent } = await buildThreadChatRequest(parsed.data);

    const chatRequest = {
      model,
      messages,
      stream: parsed.data.stream,
      "x-effort": effort,
    };

    const { adapter, options, routing } = route(chatRequest, ac.signal);

    console.log(
      `[gateway] Agent chat: ${agent.name} (${agent.agentId}) → ${adapter.name} | thread=${parsed.data.threadId} | effort=${options.effort} | ${routing.reason}`,
    );

    if (parsed.data.stream) {
      await handleStreaming(res, adapter, messages, options);
      // Persist after streaming (we don't have the full content easily, skip for streaming)
    } else {
      const response = await handleNonStreaming(adapter, messages, options);
      (response as unknown as Record<string, unknown>)["x-routing"] = routing;

      // Persist to thread
      const content = response.choices[0]?.message.content ?? "";
      await persistResponse(
        parsed.data.agentId,
        parsed.data.threadId,
        parsed.data.message,
        content,
        { backend: routing.backend, effort: routing.effort, reason: routing.reason },
      );

      res.json(response);
    }
  } catch (err) {
    console.error("[gateway] Agent chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
    }
  } finally {
    releaseSlot();
  }
});

// ── Chat completions ─────────────────────────────────────────────────

app.post("/v1/chat/completions", async (req, res) => {
  // Validate request
  const parsed = ChatCompletionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        message: "Invalid request",
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  const request = parsed.data;

  // Check effort override from header
  const effortHeader = req.headers["x-effort"];
  if (
    typeof effortHeader === "string" &&
    ["low", "medium", "high", "max"].includes(effortHeader)
  ) {
    request["x-effort"] = effortHeader as "low" | "medium" | "high" | "max";
  }

  // Concurrency check
  if (!acquireSlot()) {
    res
      .status(429)
      .json({
        error: { message: `Too many concurrent requests (max ${CONFIG.maxConcurrency})` },
      });
    return;
  }

  // Abort controller for client disconnect
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) ac.abort();
  });

  try {
    const { adapter, options, routing } = route(request, ac.signal);
    const startTime = Date.now();

    console.log(
      `[gateway] ${new Date().toISOString()} → ${adapter.name} | model="${request.model}" effort=${options.effort} stream=${request.stream} | ${routing.reason}`,
    );

    if (request.stream) {
      await handleStreaming(res, adapter, request.messages, options);
    } else {
      // Check cache for non-streaming requests
      const cached = getCached(request.model, request.messages);
      if (cached) {
        console.log(`[gateway] Cache hit for ${request.model}`);
        res.json(cached);
        return;
      }

      const response = await handleNonStreaming(
        adapter,
        request.messages,
        options,
      );
      // Attach routing metadata
      (response as unknown as Record<string, unknown>)["x-routing"] = routing;

      // Record routing outcome for analytics
      recordRoute({
        timestamp: Date.now(),
        model: request.model,
        backend: routing.backend,
        effort: routing.effort,
        reason: routing.reason,
        confidence: routing.confidence,
        promptChars: request.messages.map((m) => extractTextContent(m)).join("").length,
        responseChars: response.choices[0]?.message.content.length ?? 0,
        latencyMs: Date.now() - startTime,
        tokenEstimate: { prompt: response.usage.prompt_tokens, completion: response.usage.completion_tokens },
      });

      // Cache the response
      setCache(request.model, request.messages, response);

      res.json(response);
    }
  } catch (err) {
    console.error("[gateway] Error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: err instanceof Error ? err.message : "Internal server error",
        },
      });
    }
  } finally {
    releaseSlot();
  }
});

// ── Routing policy ───────────────────────────────────────────────────

app.get("/v1/router/policy", (_req, res) => {
  res.json(getPolicy());
});

app.post("/v1/router/policy/reload", async (_req, res) => {
  try {
    const policy = await loadPolicy();
    res.json({ status: "reloaded", policy });
  } catch (err) {
    res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

// ── Tool registration ────────────────────────────────────────────────

app.post("/v1/tools", async (req, res) => {
  const parsed = ToolDefinitionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid tool definition", details: parsed.error.flatten() } });
    return;
  }
  try {
    const tool = await registerTool(parsed.data);
    res.json(tool);
  } catch (err) {
    res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

app.get("/v1/tools", (req, res) => {
  const agentId = req.query.agentId as string | undefined;
  res.json({ tools: listTools(agentId) });
});

app.delete("/v1/tools/:name", async (req, res) => {
  const removed = await removeTool(req.params.name);
  if (!removed) {
    res.status(404).json({ error: { message: "Tool not found" } });
    return;
  }
  res.json({ status: "removed" });
});

// ── Context enhanced (git diff, project discovery) ───────────────────

app.post("/v1/context/git-diff", async (req, res) => {
  const schema = z.object({
    path: z.string().min(1),
    staged: z.boolean().default(false),
    commits: z.number().int().min(1).max(50).default(3),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const diff = await getGitDiff(parsed.data.path, {
      staged: parsed.data.staged,
      commits: parsed.data.commits,
    });
    if (!diff) {
      res.status(404).json({ error: { message: "Not a git repository or no changes found" } });
      return;
    }
    res.json(diff);
  } catch (err) {
    res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

app.post("/v1/context/discover", async (req, res) => {
  const schema = z.object({ path: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const info = await discoverProject(parsed.data.path);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

// ── Cache management ─────────────────────────────────────────────────

app.get("/v1/cache/stats", (_req, res) => {
  res.json(getCacheStats());
});

app.delete("/v1/cache", (_req, res) => {
  clearCache();
  res.json({ status: "cleared" });
});

// ── Image Generation ─────────────────────────────────────────────────

app.post("/v1/images/generations", async (req, res) => {
  const parsed = ImageGenRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const result = await generateImages(parsed.data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

// ── Audio Transcription ──────────────────────────────────────────────

app.post("/v1/audio/transcriptions", async (req, res) => {
  const parsed = AudioTranscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const result = await transcribeAudio(parsed.data.audio, parsed.data.model);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

// ── Video Generation (async job queue) ───────────────────────────────

app.post("/v1/video/generations", async (req, res) => {
  const parsed = VideoGenRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid request", details: parsed.error.flatten() } });
    return;
  }
  try {
    const job = await createVideoJob(parsed.data);
    res.status(202).json(job);
  } catch (err) {
    res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

app.get("/v1/video/generations/:id", (req, res) => {
  const job = getVideoJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: { message: "Job not found" } });
    return;
  }
  res.json(job);
});

app.get("/v1/video/generations", (_req, res) => {
  res.json({ jobs: listVideoJobs() });
});

// ── LAN Gateway Management ──────────────────────────────────────────

app.get("/v1/lan/policy", (_req, res) => {
  res.json(getLanPolicy());
});

app.put("/v1/lan/policy", async (req, res) => {
  try {
    const { mode, ips } = req.body as { mode?: string; ips?: string[] };
    const current = getLanPolicy();
    const updated = {
      ...current,
      ...(mode && { mode: mode as "allow" | "deny" }),
      ...(ips && { ips }),
    };
    await saveLanPolicy(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: { message: err instanceof Error ? err.message : String(err) } });
  }
});

// ── Start server ─────────────────────────────────────────────────────

const bindHost = getBindAddress();

app.listen(CONFIG.port, bindHost, () => {
  const lanTag = isLanMode() ? " [LAN MODE]" : "";
  console.log(`
╔══════════════════════════════════════════════════════════╗
║            Gateway2Models  v4.0.0${lanTag.padEnd(24)}║
║            The Model Gateway for AI Agents               ║
╠══════════════════════════════════════════════════════════╣
║  Listening on http://${bindHost}:${CONFIG.port}${" ".repeat(Math.max(0, 21 - bindHost.length))}║
║  Web UI:    http://${bindHost}:${CONFIG.port}/${" ".repeat(Math.max(0, 20 - bindHost.length))}║
║                                                          ║
║  Backends:  vscode-claude, agency-claude, agency-copilot ║
║             ollama (local), auto (smart routing)         ║
║                                                          ║
║  Generation: /v1/images/generations                      ║
║              /v1/audio/transcriptions                    ║
║              /v1/video/generations                       ║
║                                                          ║
║  MCP:       node dist/mcp-server.js (stdio)              ║
║  Memory:    ~/.g2m/agents/                               ║
╚══════════════════════════════════════════════════════════╝
`);
});
