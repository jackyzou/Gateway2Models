import { AgencyClaudeAdapter } from "./adapters/agency-claude.js";
import { AgencyCopilotAdapter } from "./adapters/agency-copilot.js";
import { VsCodeClaudeAdapter } from "./adapters/vscode-claude.js";
import { OllamaAdapter } from "./adapters/ollama.js";
import { CONFIG } from "./config.js";
import { classifyEffort } from "./effort.js";
import { extractTextContent } from "./types.js";
import type {
  AdapterOptions,
  ChatCompletionRequest,
  EffortLevel,
  Message,
  ModelAdapter,
} from "./types.js";

// ── Singleton adapter instances ──────────────────────────────────────

const adapters: Record<string, ModelAdapter> = {
  "vscode-claude": new VsCodeClaudeAdapter(),
  "agency-claude": new AgencyClaudeAdapter(),
  "agency-copilot": new AgencyCopilotAdapter(),
  "ollama": new OllamaAdapter(),
};

// ── Smart content classification ─────────────────────────────────────

/** MSFT ecosystem keywords — weighted by specificity */
const MSFT_STRONG_KEYWORDS = [
  "azure devops", "azure-devops", "workiq", "work-iq",
  "azure boards", "azure pipelines", "azure repos",
  "microsoft graph", "msgraph", "entra id",
  "power automate", "power bi", "power platform",
  "sharepoint online", "teams message", "outlook calendar",
];

const MSFT_WEAK_KEYWORDS = [
  "ado", "m365", "microsoft 365", "teams", "outlook",
  "sharepoint", "onedrive", "office", "planner", "viva",
  "entra", "active directory", "intune", "dynamics",
];

/** Task complexity signals for routing to agency-claude vs vscode-claude */
const COMPLEX_TASK_SIGNALS = [
  "multi-file", "multi file", "across files", "entire codebase",
  "architecture", "system design", "refactor", "redesign",
  "full implementation", "complete implementation",
  "production-ready", "production ready",
  "end-to-end", "end to end", "e2e test",
  "security audit", "performance optimization",
  "database migration", "api design",
];

/** Quick task signals — prefer lightweight vscode-claude */
const QUICK_TASK_SIGNALS = [
  "what is", "how to", "explain", "define", "example of",
  "syntax for", "convert", "translate", "format",
  "fix this error", "fix this bug", "typo",
  "one-liner", "regex for", "command for",
];

interface ClassificationResult {
  backend: string;
  confidence: number;
  reason: string;
}

function classifyRequest(messages: readonly Message[]): ClassificationResult {
  const fullText = messages.map((m) => extractTextContent(m)).join(" ");
  const lower = fullText.toLowerCase();
  const charLen = fullText.length;
  const messageCount = messages.length;

  // Score-based classification
  let msftScore = 0;
  let complexityScore = 0;

  // MSFT keyword scoring
  for (const kw of MSFT_STRONG_KEYWORDS) {
    if (lower.includes(kw)) msftScore += 3;
  }
  for (const kw of MSFT_WEAK_KEYWORDS) {
    if (lower.includes(kw)) msftScore += 1;
  }

  // Complexity scoring
  for (const sig of COMPLEX_TASK_SIGNALS) {
    if (lower.includes(sig)) complexityScore += 2;
  }
  for (const sig of QUICK_TASK_SIGNALS) {
    if (lower.includes(sig)) complexityScore -= 1;
  }

  // Length-based complexity adjustment
  if (charLen > 3000) complexityScore += 3;
  else if (charLen > 1500) complexityScore += 2;
  else if (charLen > 500) complexityScore += 1;

  // Multi-turn conversations are more complex
  if (messageCount > 4) complexityScore += 1;

  // Code blocks suggest coding tasks
  const codeBlockCount = (fullText.match(/```/g) ?? []).length / 2;
  if (codeBlockCount > 2) complexityScore += 2;

  // Route decision
  if (msftScore >= 2) {
    return {
      backend: "agency-copilot",
      confidence: Math.min(0.95, 0.5 + msftScore * 0.1),
      reason: `MSFT content detected (score: ${msftScore})`,
    };
  }

  if (complexityScore >= 4) {
    return {
      backend: "agency-claude",
      confidence: Math.min(0.9, 0.5 + complexityScore * 0.05),
      reason: `Complex task detected (score: ${complexityScore})`,
    };
  }

  return {
    backend: "vscode-claude",
    confidence: 0.7,
    reason: `Default routing (complexity: ${complexityScore}, msft: ${msftScore})`,
  };
}

// ── Router ───────────────────────────────────────────────────────────

export interface RouteResult {
  adapter: ModelAdapter;
  options: AdapterOptions;
  routing: {
    backend: string;
    confidence: number;
    reason: string;
    effort: EffortLevel;
  };
}

/**
 * Route a chat completion request to the appropriate backend adapter.
 *
 * Routing logic:
 *  1. Explicit model alias → use that adapter directly
 *  2. "auto" → score-based classification:
 *     - MSFT keyword scoring (strong=3pts, weak=1pt) → Agency Copilot (threshold: 2)
 *     - Complexity scoring (task signals, length, code blocks) → Agency Claude (threshold: 4)
 *     - Default → VS Code Claude
 *  3. Effort auto-classification for all backends
 */
export function route(
  request: ChatCompletionRequest,
  signal?: AbortSignal,
): RouteResult {
  const modelKey = CONFIG.models[request.model] ?? "auto";

  let classification: ClassificationResult;

  if (modelKey !== "auto") {
    classification = {
      backend: modelKey,
      confidence: 1.0,
      reason: `Explicit model selection: ${request.model}`,
    };
  } else {
    classification = classifyRequest(request.messages);
  }

  const adapter = adapters[classification.backend];
  if (!adapter) {
    throw new Error(`Unknown backend: ${classification.backend}`);
  }

  // Effort classification applies to all backends
  const effort: EffortLevel =
    request["x-effort"] ?? classifyEffort(request.messages);

  return {
    adapter,
    options: {
      effort,
      timeoutMs: CONFIG.timeoutMs,
      signal,
    },
    routing: {
      backend: classification.backend,
      confidence: classification.confidence,
      reason: classification.reason,
      effort,
    },
  };
}

/** List all available model aliases with metadata */
export function listModels(): { id: string; backend: string; description: string }[] {
  const descriptions: Record<string, string> = {
    "vscode-claude": "Claude Opus 4.6 (1M) via VS Code CLI — fast, general-purpose",
    "agency-claude": "Claude Opus 4.6 (1M) via Agency — dynamic effort, complex tasks",
    "agency-copilot": "Agency Copilot — Microsoft ecosystem (ADO, WorkIQ, M365, MCP)",
    ollama: `Ollama local models (${CONFIG.ollama.model}) — offline, private, fast`,
    auto: "Smart auto-routing based on prompt content analysis",
  };

  return Object.entries(CONFIG.models).map(([id, backend]) => ({
    id,
    backend,
    description: descriptions[backend] ?? backend,
  }));
}
