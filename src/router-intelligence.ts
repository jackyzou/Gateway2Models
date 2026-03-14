import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
const STATS_DIR = join(HOME, ".g2m", "stats");

// ── Types ────────────────────────────────────────────────────────────

export interface RouteRecord {
  timestamp: number;
  model: string;
  backend: string;
  effort: string;
  reason: string;
  confidence: number;
  promptChars: number;
  responseChars: number;
  latencyMs: number;
  tokenEstimate: { prompt: number; completion: number };
}

export interface BackendStats {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  lastUsed: number;
}

export interface RouterStats {
  totalRequests: number;
  byBackend: Record<string, BackendStats>;
  recentRoutes: RouteRecord[];
}

// ── Cost estimates per backend (tokens) ──────────────────────────────

const COST_PER_1K_INPUT: Record<string, number> = {
  "vscode-claude": 0.015,
  "agency-claude": 0.015,
  "agency-copilot": 0.0,  // included in license
  ollama: 0.0,             // local, free
};

const COST_PER_1K_OUTPUT: Record<string, number> = {
  "vscode-claude": 0.075,
  "agency-claude": 0.075,
  "agency-copilot": 0.0,
  ollama: 0.0,
};

// ── In-memory stats (persisted periodically) ─────────────────────────

let stats: RouterStats = {
  totalRequests: 0,
  byBackend: {},
  recentRoutes: [],
};

const MAX_RECENT_ROUTES = 200;

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

function statsPath(): string {
  return join(STATS_DIR, "router-stats.json");
}

/** Load persisted stats on startup */
export async function loadStats(): Promise<void> {
  try {
    const raw = await readFile(statsPath(), "utf-8");
    stats = JSON.parse(raw) as RouterStats;
  } catch {
    // First run or corrupt file — start fresh
  }
}

/** Persist current stats to disk */
async function persistStats(): Promise<void> {
  try {
    await ensureDir(STATS_DIR);
    await writeFile(statsPath(), JSON.stringify(stats, null, 2), "utf-8");
  } catch {
    // Best-effort persistence
  }
}

// Persist every 30 seconds
let persistTimer: ReturnType<typeof setInterval> | undefined;
export function startStatsPersistence(): void {
  if (!persistTimer) {
    persistTimer = setInterval(persistStats, 30_000);
  }
}

// ── Record a routing outcome ─────────────────────────────────────────

export function recordRoute(record: RouteRecord): void {
  stats.totalRequests++;

  // Per-backend stats
  if (!stats.byBackend[record.backend]) {
    stats.byBackend[record.backend] = {
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      lastUsed: 0,
    };
  }

  const bs = stats.byBackend[record.backend];
  bs.totalRequests++;
  bs.totalPromptTokens += record.tokenEstimate.prompt;
  bs.totalCompletionTokens += record.tokenEstimate.completion;
  bs.totalLatencyMs += record.latencyMs;
  bs.avgLatencyMs = bs.totalLatencyMs / bs.totalRequests;
  bs.lastUsed = record.timestamp;

  // Recent routes ring buffer
  stats.recentRoutes.push(record);
  if (stats.recentRoutes.length > MAX_RECENT_ROUTES) {
    stats.recentRoutes = stats.recentRoutes.slice(-MAX_RECENT_ROUTES);
  }
}

// ── Get stats with cost estimates ────────────────────────────────────

export interface StatsWithCost extends RouterStats {
  estimatedCost: Record<string, { input: number; output: number; total: number }>;
  totalEstimatedCost: number;
}

export function getStats(): StatsWithCost {
  const estimatedCost: Record<string, { input: number; output: number; total: number }> = {};
  let totalEstimatedCost = 0;

  for (const [backend, bs] of Object.entries(stats.byBackend)) {
    const inputCost = (bs.totalPromptTokens / 1000) * (COST_PER_1K_INPUT[backend] ?? 0.01);
    const outputCost = (bs.totalCompletionTokens / 1000) * (COST_PER_1K_OUTPUT[backend] ?? 0.05);
    estimatedCost[backend] = {
      input: Math.round(inputCost * 10000) / 10000,
      output: Math.round(outputCost * 10000) / 10000,
      total: Math.round((inputCost + outputCost) * 10000) / 10000,
    };
    totalEstimatedCost += inputCost + outputCost;
  }

  return {
    ...stats,
    estimatedCost,
    totalEstimatedCost: Math.round(totalEstimatedCost * 10000) / 10000,
  };
}
