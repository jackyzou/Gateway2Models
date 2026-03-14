import { randomUUID } from "node:crypto";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  Message,
} from "./types.js";
import { route } from "./router.js";
import { handleNonStreaming } from "./streaming.js";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────────────

export interface SessionTask {
  id: string;
  model: string;
  status: "pending" | "running" | "completed" | "failed";
  messages: Message[];
  result?: ChatCompletionResponse;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface ParallelSession {
  id: string;
  tasks: SessionTask[];
  createdAt: number;
  status: "running" | "completed" | "partial";
}

// Active sessions for tracking
const sessions = new Map<string, ParallelSession>();

// ── Request schema ───────────────────────────────────────────────────

export const ParallelRequestSchema = z.object({
  tasks: z.array(z.object({
    model: z.string().default("auto"),
    messages: z.array(z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })).min(1),
    "x-effort": z.enum(["low", "medium", "high", "max"]).optional(),
  })).min(1).max(10),
  /** Max concurrent tasks within this batch (default: 3) */
  concurrency: z.number().int().min(1).max(5).default(3),
});

export type ParallelRequest = z.infer<typeof ParallelRequestSchema>;

// ── Session execution ────────────────────────────────────────────────

async function executeTask(task: SessionTask): Promise<void> {
  task.status = "running";
  task.startedAt = Date.now();

  try {
    const request: ChatCompletionRequest = {
      model: task.model,
      messages: task.messages,
      stream: false,
    };

    const { adapter, options } = route(request);
    const response = await handleNonStreaming(adapter, task.messages, options);

    task.result = response;
    task.status = "completed";
  } catch (err) {
    task.error = err instanceof Error ? err.message : String(err);
    task.status = "failed";
  } finally {
    task.completedAt = Date.now();
  }
}

/** Run tasks with controlled concurrency */
async function runWithConcurrency(
  tasks: SessionTask[],
  concurrency: number,
): Promise<void> {
  const queue = [...tasks];
  const active: Promise<void>[] = [];

  while (queue.length > 0 || active.length > 0) {
    while (active.length < concurrency && queue.length > 0) {
      const task = queue.shift()!;
      const promise = executeTask(task).then(() => {
        active.splice(active.indexOf(promise), 1);
      });
      active.push(promise);
    }
    if (active.length > 0) {
      await Promise.race(active);
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────

export async function createParallelSession(
  request: ParallelRequest,
): Promise<ParallelSession> {
  const sessionId = randomUUID();

  const tasks: SessionTask[] = request.tasks.map((t) => ({
    id: randomUUID(),
    model: t.model,
    status: "pending" as const,
    messages: t.messages,
  }));

  const session: ParallelSession = {
    id: sessionId,
    tasks,
    createdAt: Date.now(),
    status: "running",
  };

  sessions.set(sessionId, session);

  await runWithConcurrency(tasks, request.concurrency);

  const allCompleted = tasks.every((t) => t.status === "completed");
  const allFailed = tasks.every((t) => t.status === "failed");
  session.status = allCompleted
    ? "completed"
    : allFailed
      ? "partial"
      : "partial";

  return session;
}

export function getSession(id: string): ParallelSession | undefined {
  return sessions.get(id);
}

export function listSessions(): { id: string; status: string; taskCount: number; createdAt: number }[] {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    status: s.status,
    taskCount: s.tasks.length,
    createdAt: s.createdAt,
  }));
}
