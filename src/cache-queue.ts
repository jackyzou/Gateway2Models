import { randomUUID } from "node:crypto";

// ── Response Cache ───────────────────────────────────────────────────

interface CacheEntry {
  key: string;
  response: unknown;
  createdAt: number;
  ttlMs: number;
  hits: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60_000; // 1 minute
const MAX_CACHE_SIZE = 100;

function cacheKey(model: string, messages: { role: string; content: unknown }[]): string {
  const msgHash = messages.map((m) => `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join("|");
  return `${model}::${msgHash}`;
}

export function getCached(model: string, messages: { role: string; content: unknown }[]): unknown | null {
  const key = cacheKey(model, messages);
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.createdAt > entry.ttlMs) {
    cache.delete(key);
    return null;
  }

  entry.hits++;
  return entry.response;
}

export function setCache(
  model: string,
  messages: { role: string; content: unknown }[],
  response: unknown,
  ttlMs = DEFAULT_TTL_MS,
): void {
  // Evict oldest if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    let oldest: string | undefined;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.createdAt < oldestTime) {
        oldestTime = v.createdAt;
        oldest = k;
      }
    }
    if (oldest) cache.delete(oldest);
  }

  const key = cacheKey(model, messages);
  cache.set(key, {
    key,
    response,
    createdAt: Date.now(),
    ttlMs,
    hits: 0,
  });
}

export function getCacheStats(): {
  size: number;
  maxSize: number;
  totalHits: number;
  entries: { key: string; hits: number; age: string }[];
} {
  let totalHits = 0;
  const entries: { key: string; hits: number; age: string }[] = [];
  const now = Date.now();

  for (const [, v] of cache) {
    totalHits += v.hits;
    entries.push({
      key: v.key.slice(0, 80),
      hits: v.hits,
      age: `${Math.round((now - v.createdAt) / 1000)}s`,
    });
  }

  return { size: cache.size, maxSize: MAX_CACHE_SIZE, totalHits, entries };
}

export function clearCache(): void {
  cache.clear();
}

// ── Request Queue with Priority ──────────────────────────────────────

interface QueuedRequest {
  id: string;
  priority: number;
  createdAt: number;
  resolve: (value: boolean) => void;
}

const queue: QueuedRequest[] = [];
let activeSlots = 0;
let maxSlots = 5;

export function configureQueue(opts: { maxConcurrency: number }): void {
  maxSlots = opts.maxConcurrency;
}

/**
 * Acquire an execution slot with priority queuing.
 * Higher priority values are processed first.
 * Returns true when slot is acquired, false if cancelled.
 */
export function acquireSlotWithPriority(priority = 0): Promise<boolean> {
  if (activeSlots < maxSlots) {
    activeSlots++;
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const id = randomUUID().slice(0, 8);
    queue.push({ id, priority, createdAt: Date.now(), resolve });
    // Keep sorted by priority (highest first), then FIFO
    queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  });
}

export function releaseSlotWithPriority(): void {
  if (queue.length > 0) {
    const next = queue.shift();
    next?.resolve(true);
  } else {
    activeSlots = Math.max(0, activeSlots - 1);
  }
}

export function getQueueStats(): {
  activeSlots: number;
  maxSlots: number;
  queueLength: number;
  queuedRequests: { id: string; priority: number; waitMs: number }[];
} {
  const now = Date.now();
  return {
    activeSlots,
    maxSlots,
    queueLength: queue.length,
    queuedRequests: queue.map((q) => ({
      id: q.id,
      priority: q.priority,
      waitMs: now - q.createdAt,
    })),
  };
}
