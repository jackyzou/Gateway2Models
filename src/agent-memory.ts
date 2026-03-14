import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// ── Storage root ─────────────────────────────────────────────────────

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
const MEMORY_ROOT = join(HOME, ".g2m");

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await ensureDir(join(path, ".."));
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

// ── Agent Profile Schema ─────────────────────────────────────────────

export const AgentProfileSchema = z.object({
  /** Unique agent identifier (auto-generated if not provided) */
  agentId: z.string().optional(),
  /** Human-readable name for this agent */
  name: z.string().min(1),
  /** What this agent does */
  description: z.string().optional(),
  /** Agent's skills and capabilities */
  skills: z.array(z.string()).default([]),
  /** Programming languages / frameworks the agent works with */
  techStack: z.array(z.string()).default([]),
  /** The project/workspace the agent is operating in */
  workspace: z.object({
    /** Root path of the project */
    path: z.string().optional(),
    /** Description of the project */
    description: z.string().optional(),
    /** Key files/directories the agent typically works with */
    keyPaths: z.array(z.string()).default([]),
  }).default({}),
  /** What the agent is trying to achieve (high-level goals) */
  goals: z.array(z.string()).default([]),
  /** Preferred model/backend for this agent */
  preferredModel: z.string().default("auto"),
  /** Preferred effort level */
  preferredEffort: z.enum(["low", "medium", "high", "max"]).optional(),
  /** Custom system prompt to prepend to every request */
  systemPrompt: z.string().optional(),
  /** Arbitrary metadata the agent wants to persist */
  metadata: z.record(z.unknown()).default({}),
});

export type AgentProfile = z.infer<typeof AgentProfileSchema> & {
  agentId: string;
  createdAt: number;
  updatedAt: number;
};

// ── Conversation Thread ──────────────────────────────────────────────

export interface ThreadMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
  model?: string;
  routing?: {
    backend: string;
    effort: string;
    reason: string;
  };
}

export interface ConversationThread {
  threadId: string;
  agentId: string;
  title: string;
  messages: ThreadMessage[];
  createdAt: number;
  updatedAt: number;
  /** Summary of what was accomplished (periodically auto-generated) */
  summary?: string;
  /** Files that were loaded as context for this thread */
  contextPaths: string[];
  /** Current task/goal for this thread */
  goal?: string;
  /** Thread state: active or archived */
  state: "active" | "archived";
}

// ── Agent Memory Store ───────────────────────────────────────────────

function agentDir(agentId: string): string {
  return join(MEMORY_ROOT, "agents", agentId);
}

function profilePath(agentId: string): string {
  return join(agentDir(agentId), "profile.json");
}

function threadPath(agentId: string, threadId: string): string {
  return join(agentDir(agentId), "threads", `${threadId}.json`);
}

function threadsDir(agentId: string): string {
  return join(agentDir(agentId), "threads");
}

// ── Agent CRUD ───────────────────────────────────────────────────────

export async function registerAgent(input: z.infer<typeof AgentProfileSchema>): Promise<AgentProfile> {
  const agentId = input.agentId ?? randomUUID().slice(0, 12);
  const now = Date.now();

  // Check if agent already exists — merge if so
  const existing = await getAgent(agentId);
  if (existing) {
    return updateAgent(agentId, input);
  }

  const profile: AgentProfile = {
    ...input,
    agentId,
    createdAt: now,
    updatedAt: now,
  };

  await ensureDir(agentDir(agentId));
  await ensureDir(threadsDir(agentId));
  await writeJson(profilePath(agentId), profile);
  return profile;
}

export async function getAgent(agentId: string): Promise<AgentProfile | null> {
  return readJson<AgentProfile>(profilePath(agentId));
}

export async function updateAgent(
  agentId: string,
  updates: Partial<z.infer<typeof AgentProfileSchema>>,
): Promise<AgentProfile> {
  const existing = await getAgent(agentId);
  if (!existing) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const updated: AgentProfile = {
    ...existing,
    ...updates,
    agentId, // never overwrite ID
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
    // Merge arrays instead of replacing
    skills: [...new Set([...existing.skills, ...(updates.skills ?? [])])],
    techStack: [...new Set([...existing.techStack, ...(updates.techStack ?? [])])],
    goals: updates.goals ?? existing.goals,
    metadata: { ...existing.metadata, ...(updates.metadata ?? {}) },
  };

  await writeJson(profilePath(agentId), updated);
  return updated;
}

export async function listAgents(): Promise<AgentProfile[]> {
  try {
    const agentsRoot = join(MEMORY_ROOT, "agents");
    await ensureDir(agentsRoot);
    const dirs = await readdir(agentsRoot, { withFileTypes: true });
    const profiles: AgentProfile[] = [];
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const profile = await getAgent(dir.name);
        if (profile) profiles.push(profile);
      }
    }
    return profiles;
  } catch {
    return [];
  }
}

// ── Thread CRUD ──────────────────────────────────────────────────────

export async function createThread(
  agentId: string,
  opts: { title?: string; goal?: string; contextPaths?: string[] } = {},
): Promise<ConversationThread> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const threadId = randomUUID().slice(0, 12);
  const now = Date.now();

  const thread: ConversationThread = {
    threadId,
    agentId,
    title: opts.title ?? `Thread ${threadId}`,
    messages: [],
    createdAt: now,
    updatedAt: now,
    contextPaths: opts.contextPaths ?? [],
    goal: opts.goal,
    state: "active",
  };

  // If agent has a system prompt, prepend it
  if (agent.systemPrompt) {
    thread.messages.push({
      role: "system",
      content: agent.systemPrompt,
      timestamp: now,
    });
  }

  await writeJson(threadPath(agentId, threadId), thread);
  return thread;
}

export async function getThread(
  agentId: string,
  threadId: string,
): Promise<ConversationThread | null> {
  return readJson<ConversationThread>(threadPath(agentId, threadId));
}

export async function appendMessages(
  agentId: string,
  threadId: string,
  messages: ThreadMessage[],
): Promise<ConversationThread> {
  const thread = await getThread(agentId, threadId);
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  thread.messages.push(...messages);
  thread.updatedAt = Date.now();
  await writeJson(threadPath(agentId, threadId), thread);
  return thread;
}

export async function updateThreadMeta(
  agentId: string,
  threadId: string,
  updates: { title?: string; summary?: string; goal?: string; state?: "active" | "archived"; contextPaths?: string[] },
): Promise<ConversationThread> {
  const thread = await getThread(agentId, threadId);
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  if (updates.title !== undefined) thread.title = updates.title;
  if (updates.summary !== undefined) thread.summary = updates.summary;
  if (updates.goal !== undefined) thread.goal = updates.goal;
  if (updates.state !== undefined) thread.state = updates.state;
  if (updates.contextPaths !== undefined) thread.contextPaths = updates.contextPaths;
  thread.updatedAt = Date.now();

  await writeJson(threadPath(agentId, threadId), thread);
  return thread;
}

export async function listThreads(
  agentId: string,
  state?: "active" | "archived",
): Promise<Omit<ConversationThread, "messages">[]> {
  try {
    const dir = threadsDir(agentId);
    await ensureDir(dir);
    const files = await readdir(dir);
    const threads: Omit<ConversationThread, "messages">[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const thread = await readJson<ConversationThread>(join(dir, file));
      if (!thread) continue;
      if (state && thread.state !== state) continue;
      const { messages: _messages, ...meta } = thread;
      threads.push(meta);
    }
    return threads.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

// ── Build Context-Enriched Messages ──────────────────────────────────

/**
 * Build the full message array for a chat completion request,
 * merging agent profile context, thread history, and new user message.
 *
 * This is the core function that makes G2M context-aware.
 */
export async function buildContextMessages(
  agentId: string,
  threadId: string,
  userMessage: string,
): Promise<{ messages: ThreadMessage[]; agent: AgentProfile; thread: ConversationThread }> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const thread = await getThread(agentId, threadId);
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  // Build system context from agent profile
  const contextParts: string[] = [];

  contextParts.push(`You are assisting agent "${agent.name}".`);
  if (agent.description) contextParts.push(`Agent description: ${agent.description}`);
  if (agent.skills.length > 0) contextParts.push(`Agent skills: ${agent.skills.join(", ")}`);
  if (agent.techStack.length > 0) contextParts.push(`Tech stack: ${agent.techStack.join(", ")}`);
  if (agent.workspace.path) contextParts.push(`Working in: ${agent.workspace.path}`);
  if (agent.workspace.description) contextParts.push(`Project: ${agent.workspace.description}`);
  if (agent.goals.length > 0) contextParts.push(`Current goals:\n${agent.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}`);
  if (thread.goal) contextParts.push(`Thread goal: ${thread.goal}`);
  if (thread.summary) contextParts.push(`Previous progress: ${thread.summary}`);

  const systemContext: ThreadMessage = {
    role: "system",
    content: contextParts.join("\n\n"),
    timestamp: Date.now(),
  };

  // Combine: system context + thread history + new message
  const now = Date.now();
  const newMsg: ThreadMessage = { role: "user", content: userMessage, timestamp: now };

  // Take last N messages from thread to stay within context limits
  const MAX_HISTORY_MESSAGES = 40;
  const history = thread.messages.slice(-MAX_HISTORY_MESSAGES);

  return {
    messages: [systemContext, ...history, newMsg],
    agent,
    thread,
  };
}
