import { mkdir, readFile, writeFile, readdir, appendFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
const SESSIONS_DIR = join(HOME, ".g2m", "sessions");

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

// ── Types (OpenViking-inspired) ──────────────────────────────────────

export interface ContextSession {
  id: string;
  /** Device or agent that owns this session */
  ownerId: string;
  ownerType: "device" | "agent";
  /** Human-readable label */
  title: string;
  /** L0: one-line abstract (~100 tokens) */
  abstract: string;
  /** L1: structured overview (~2k tokens) */
  overview: string;
  /** Active messages in current window */
  messageCount: number;
  /** Number of archived compression cycles */
  archiveCount: number;
  createdAt: number;
  updatedAt: number;
  /** Metadata: device IP, user-agent, agent skills */
  meta: Record<string, unknown>;
  state: "active" | "archived";
}

export interface SessionMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
  /** Which model/backend served this */
  model?: string;
  /** Context URIs referenced in this message */
  contextRefs?: string[];
}

export interface SessionArchive {
  index: number;
  messageCount: number;
  summary: string;
  abstract: string;
  archivedAt: number;
}

// ── Memory types (6 categories from OpenViking) ──────────────────────

export interface MemoryEntry {
  id: string;
  category: "profile" | "preferences" | "entities" | "events" | "cases" | "patterns";
  scope: "user" | "agent";
  content: string;
  createdAt: number;
  updatedAt: number;
  /** Source session that generated this memory */
  sourceSessionId?: string;
}

// ── Paths ────────────────────────────────────────────────────────────

function sessionDir(id: string): string {
  return join(SESSIONS_DIR, id);
}

function messagesPath(id: string): string {
  return join(sessionDir(id), "messages.jsonl");
}

function metaPath(id: string): string {
  return join(sessionDir(id), "session.json");
}

function archiveDir(id: string, index: number): string {
  return join(sessionDir(id), "history", `archive_${String(index).padStart(3, "0")}`);
}

const MEMORIES_DIR = join(HOME, ".g2m", "memories");

function memoryPath(scope: string, category: string, id: string): string {
  return join(MEMORIES_DIR, scope, category, `${id}.json`);
}

// ── Device Fingerprint ───────────────────────────────────────────────

export function deviceFingerprint(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}::${userAgent}`).digest("hex").slice(0, 16);
}

// ── CRUD Operations ──────────────────────────────────────────────────

export async function createSession(opts: {
  ownerId: string;
  ownerType: "device" | "agent";
  title?: string;
  meta?: Record<string, unknown>;
}): Promise<ContextSession> {
  const id = randomUUID().slice(0, 12);
  const now = Date.now();

  const session: ContextSession = {
    id,
    ownerId: opts.ownerId,
    ownerType: opts.ownerType,
    title: opts.title ?? `Session ${new Date().toISOString().slice(0, 16)}`,
    abstract: "",
    overview: "",
    messageCount: 0,
    archiveCount: 0,
    createdAt: now,
    updatedAt: now,
    meta: opts.meta ?? {},
    state: "active",
  };

  await ensureDir(sessionDir(id));
  await writeFile(metaPath(id), JSON.stringify(session, null, 2), "utf-8");
  return session;
}

export async function getSession(id: string): Promise<ContextSession | null> {
  try {
    const raw = await readFile(metaPath(id), "utf-8");
    return JSON.parse(raw) as ContextSession;
  } catch {
    return null;
  }
}

export async function updateSession(
  id: string,
  updates: Partial<Pick<ContextSession, "title" | "abstract" | "overview" | "state" | "meta">>,
): Promise<ContextSession | null> {
  const session = await getSession(id);
  if (!session) return null;

  if (updates.title !== undefined) session.title = updates.title;
  if (updates.abstract !== undefined) session.abstract = updates.abstract;
  if (updates.overview !== undefined) session.overview = updates.overview;
  if (updates.state !== undefined) session.state = updates.state;
  if (updates.meta !== undefined) session.meta = { ...session.meta, ...updates.meta };
  session.updatedAt = Date.now();

  await writeFile(metaPath(id), JSON.stringify(session, null, 2), "utf-8");
  return session;
}

// ── Message Operations ───────────────────────────────────────────────

export async function appendMessage(
  sessionId: string,
  message: Omit<SessionMessage, "id" | "timestamp">,
): Promise<SessionMessage> {
  const full: SessionMessage = {
    ...message,
    id: `msg_${randomUUID().slice(0, 8)}`,
    timestamp: Date.now(),
  };

  await ensureDir(sessionDir(sessionId));
  await appendFile(messagesPath(sessionId), JSON.stringify(full) + "\n", "utf-8");

  // Update session meta
  const session = await getSession(sessionId);
  if (session) {
    session.messageCount++;
    session.updatedAt = Date.now();
    await writeFile(metaPath(sessionId), JSON.stringify(session, null, 2), "utf-8");
  }

  return full;
}

export async function getMessages(
  sessionId: string,
  limit?: number,
): Promise<SessionMessage[]> {
  try {
    const raw = await readFile(messagesPath(sessionId), "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const messages = lines.map((l) => JSON.parse(l) as SessionMessage);
    return limit ? messages.slice(-limit) : messages;
  } catch {
    return [];
  }
}

// ── Session Compression (Archive) ────────────────────────────────────

const MAX_MESSAGES_BEFORE_COMPRESS = 40;

export async function compressSessionIfNeeded(sessionId: string): Promise<boolean> {
  const messages = await getMessages(sessionId);
  if (messages.length < MAX_MESSAGES_BEFORE_COMPRESS) return false;

  const session = await getSession(sessionId);
  if (!session) return false;

  const archiveIndex = session.archiveCount + 1;
  const archivePath = archiveDir(sessionId, archiveIndex);
  await ensureDir(archivePath);

  // Move current messages to archive
  const currentMessages = await readFile(messagesPath(sessionId), "utf-8");
  await writeFile(join(archivePath, "messages.jsonl"), currentMessages, "utf-8");

  // Generate summary from messages
  const summary = generateSessionSummary(messages);
  const abstract = messages.length > 0
    ? `${session.title}: ${messages.length} messages, topics: ${extractTopics(messages).join(", ")}`
    : "";

  await writeFile(join(archivePath, "summary.md"), summary, "utf-8");
  await writeFile(join(archivePath, ".abstract.md"), abstract, "utf-8");

  // Clear current messages
  await writeFile(messagesPath(sessionId), "", "utf-8");

  // Update session meta
  session.archiveCount = archiveIndex;
  session.messageCount = 0;
  session.abstract = abstract;
  session.overview = summary;
  session.updatedAt = Date.now();
  await writeFile(metaPath(sessionId), JSON.stringify(session, null, 2), "utf-8");

  return true;
}

function generateSessionSummary(messages: SessionMessage[]): string {
  const userMsgs = messages.filter((m) => m.role === "user");
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  const topics = extractTopics(messages);

  return `# Session Summary

**Messages**: ${messages.length} (${userMsgs.length} user, ${assistantMsgs.length} assistant)
**Topics**: ${topics.join(", ")}
**Duration**: ${messages.length > 0 ? formatDuration(messages[messages.length - 1].timestamp - messages[0].timestamp) : "N/A"}

## Key Exchanges
${userMsgs.slice(0, 5).map((m) => `- ${m.content.slice(0, 100)}...`).join("\n")}
`;
}

function extractTopics(messages: SessionMessage[]): string[] {
  const words = messages
    .filter((m) => m.role === "user")
    .flatMap((m) => m.content.toLowerCase().split(/\s+/))
    .filter((w) => w.length > 4);
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

// ── Session Attribution (auto-match request to session) ──────────────

export async function attributeSession(opts: {
  agentId?: string;
  sessionId?: string;
  deviceIp?: string;
  userAgent?: string;
}): Promise<ContextSession> {
  // 1. Explicit session ID
  if (opts.sessionId) {
    const session = await getSession(opts.sessionId);
    if (session) return session;
  }

  // 2. Agent-owned session
  if (opts.agentId) {
    const recent = await findRecentSession(opts.agentId, "agent");
    if (recent) return recent;
    return createSession({
      ownerId: opts.agentId,
      ownerType: "agent",
      title: `Agent: ${opts.agentId}`,
      meta: { agentId: opts.agentId },
    });
  }

  // 3. Device-owned session (by fingerprint)
  if (opts.deviceIp && opts.userAgent) {
    const fp = deviceFingerprint(opts.deviceIp, opts.userAgent);
    const recent = await findRecentSession(fp, "device");
    if (recent) return recent;
    return createSession({
      ownerId: fp,
      ownerType: "device",
      title: `Device: ${opts.deviceIp}`,
      meta: { ip: opts.deviceIp, userAgent: opts.userAgent, fingerprint: fp },
    });
  }

  // 4. Fallback: anonymous session
  return createSession({
    ownerId: "anonymous",
    ownerType: "device",
    title: "Anonymous Session",
  });
}

async function findRecentSession(
  ownerId: string,
  ownerType: "device" | "agent",
): Promise<ContextSession | null> {
  try {
    await ensureDir(SESSIONS_DIR);
    const dirs = await readdir(SESSIONS_DIR, { withFileTypes: true });
    let best: ContextSession | null = null;

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const session = await getSession(dir.name);
      if (!session) continue;
      if (session.ownerId !== ownerId || session.ownerType !== ownerType) continue;
      if (session.state !== "active") continue;
      // Find most recently updated active session
      if (!best || session.updatedAt > best.updatedAt) {
        best = session;
      }
    }

    // Only reuse if updated within last 2 hours
    if (best && Date.now() - best.updatedAt < 2 * 60 * 60 * 1000) {
      return best;
    }
    return null;
  } catch {
    return null;
  }
}

// ── List Sessions ────────────────────────────────────────────────────

export async function listContextSessions(opts?: {
  ownerId?: string;
  ownerType?: "device" | "agent";
  state?: "active" | "archived";
  limit?: number;
}): Promise<ContextSession[]> {
  try {
    await ensureDir(SESSIONS_DIR);
    const dirs = await readdir(SESSIONS_DIR, { withFileTypes: true });
    const sessions: ContextSession[] = [];

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const session = await getSession(dir.name);
      if (!session) continue;
      if (opts?.ownerId && session.ownerId !== opts.ownerId) continue;
      if (opts?.ownerType && session.ownerType !== opts.ownerType) continue;
      if (opts?.state && session.state !== opts.state) continue;
      sessions.push(session);
    }

    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return opts?.limit ? sessions.slice(0, opts.limit) : sessions;
  } catch {
    return [];
  }
}

// ── Memory Operations ────────────────────────────────────────────────

export async function saveMemory(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<MemoryEntry> {
  const id = randomUUID().slice(0, 12);
  const now = Date.now();
  const full: MemoryEntry = { ...entry, id, createdAt: now, updatedAt: now };

  const dir = join(MEMORIES_DIR, entry.scope, entry.category);
  await ensureDir(dir);
  await writeFile(join(dir, `${id}.json`), JSON.stringify(full, null, 2), "utf-8");
  return full;
}

export async function listMemories(
  scope: "user" | "agent",
  category?: string,
): Promise<MemoryEntry[]> {
  const entries: MemoryEntry[] = [];
  try {
    const basePath = join(MEMORIES_DIR, scope);
    const categories = category ? [category] : await readdir(basePath).catch(() => []);

    for (const cat of categories) {
      const catPath = join(basePath, typeof cat === "string" ? cat : "");
      try {
        const files = await readdir(catPath);
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          try {
            const raw = await readFile(join(catPath, file), "utf-8");
            entries.push(JSON.parse(raw) as MemoryEntry);
          } catch { /* skip corrupt */ }
        }
      } catch { /* category doesn't exist */ }
    }
  } catch { /* no memories yet */ }

  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}
