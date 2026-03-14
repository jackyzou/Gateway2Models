import express from "express";
import { CONFIG } from "./config.js";
import { listModels, route } from "./router.js";
import { handleNonStreaming, handleStreaming } from "./streaming.js";
import { ChatCompletionRequestSchema } from "./types.js";
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

const app = express();
app.use(express.json({ limit: "2mb" }));

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

    console.log(
      `[gateway] ${new Date().toISOString()} → ${adapter.name} | model="${request.model}" effort=${options.effort} stream=${request.stream} | ${routing.reason}`,
    );

    if (request.stream) {
      await handleStreaming(res, adapter, request.messages, options);
    } else {
      const response = await handleNonStreaming(
        adapter,
        request.messages,
        options,
      );
      // Attach routing metadata
      (response as unknown as Record<string, unknown>)["x-routing"] = routing;
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

// ── Start server ─────────────────────────────────────────────────────

app.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║            Gateway2Models  v1.0.0                    ║
╠══════════════════════════════════════════════════════╣
║  Listening on http://${CONFIG.host}:${CONFIG.port}             ║
║                                                      ║
║  Endpoints:                                          ║
║    POST /v1/chat/completions                         ║
║    GET  /v1/models                                   ║
║    GET  /health                                      ║
║                                                      ║
║  Backends:                                           ║
║    • vscode-claude  (VS Code CLI Claude)             ║
║    • agency-claude  (Agency Claude, dynamic effort)  ║
║    • agency-copilot (Agency Copilot, MSFT/MCP)       ║
║    • auto           (auto-detect backend)            ║
╚══════════════════════════════════════════════════════╝
`);
});
