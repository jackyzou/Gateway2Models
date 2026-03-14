import { z } from "zod";
import {
  registerAgent,
  getAgent,
  createThread,
  buildContextMessages,
  appendMessages,
  updateAgent,
  type AgentProfile,
  type ThreadMessage,
} from "./agent-memory.js";
import { loadContext } from "./context-loader.js";

// ── Intake Request Schema ────────────────────────────────────────────

export const IntakeRequestSchema = z.object({
  /** Agent identity (creates new if not found, resumes if found) */
  agentId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),

  /** What the agent can do */
  skills: z.array(z.string()).default([]),
  techStack: z.array(z.string()).default([]),

  /** What the agent is working on */
  workspace: z.object({
    path: z.string().optional(),
    description: z.string().optional(),
    keyPaths: z.array(z.string()).default([]),
  }).default({}),

  /** What needs to be achieved */
  goals: z.array(z.string()).default([]),

  /** Specific task for this session */
  task: z.string().optional(),

  /** Files/directories the agent wants loaded as context */
  contextPaths: z.array(z.string()).default([]),

  /** Custom system prompt */
  systemPrompt: z.string().optional(),

  /** Preferred model/effort */
  preferredModel: z.string().default("auto"),
  preferredEffort: z.enum(["low", "medium", "high", "max"]).optional(),

  /** Resume a specific thread instead of creating a new one */
  resumeThreadId: z.string().optional(),

  /** Arbitrary metadata */
  metadata: z.record(z.unknown()).default({}),
});

export type IntakeRequest = z.infer<typeof IntakeRequestSchema>;

// ── Intake Response ──────────────────────────────────────────────────

export interface IntakeResponse {
  /** The agent's persistent profile */
  agent: AgentProfile;
  /** The active conversation thread */
  threadId: string;
  /** Pre-loaded file context (if contextPaths were provided) */
  loadedContext: {
    files: { path: string; lines: number; size: number }[];
    totalSize: number;
  };
  /** What G2M understood from the intake */
  understanding: {
    agentSummary: string;
    taskSummary: string;
    contextSummary: string;
    recommendations: string[];
  };
  /** Whether this is a new agent or a returning one */
  isReturning: boolean;
  /** Previous thread summaries (if returning) */
  previousWork?: { threadId: string; title: string; summary?: string; goal?: string; updatedAt: number }[];
}

// ── Intake Process ───────────────────────────────────────────────────

/**
 * The intake process is the first thing an agent does when connecting to G2M.
 * It tells G2M who it is, what it can do, what it needs, and what files to load.
 *
 * G2M then:
 * 1. Creates or resumes the agent profile
 * 2. Creates or resumes a conversation thread
 * 3. Loads requested file context
 * 4. Returns a structured understanding + recommendations
 */
export async function processIntake(request: IntakeRequest): Promise<IntakeResponse> {
  // 1. Register or resume agent
  const isReturning = request.agentId ? (await getAgent(request.agentId)) !== null : false;

  const agent = await registerAgent({
    agentId: request.agentId,
    name: request.name,
    description: request.description,
    skills: request.skills,
    techStack: request.techStack,
    workspace: request.workspace,
    goals: request.goals,
    preferredModel: request.preferredModel,
    preferredEffort: request.preferredEffort,
    systemPrompt: request.systemPrompt,
    metadata: request.metadata,
  });

  // 2. Create or resume thread
  let threadId: string;
  if (request.resumeThreadId) {
    threadId = request.resumeThreadId;
  } else {
    const thread = await createThread(agent.agentId, {
      title: request.task ?? `Session ${new Date().toISOString().slice(0, 16)}`,
      goal: request.task,
      contextPaths: request.contextPaths,
    });
    threadId = thread.threadId;
  }

  // 3. Load file context
  let loadedContext = { files: [] as { path: string; lines: number; size: number }[], totalSize: 0 };
  if (request.contextPaths.length > 0) {
    try {
      const ctx = await loadContext(request.contextPaths, 500_000);
      loadedContext = {
        files: ctx.map((f) => ({ path: f.path, lines: f.lines, size: f.size })),
        totalSize: ctx.reduce((s, f) => s + f.size, 0),
      };
    } catch { /* context loading is best-effort */ }
  }

  // 4. Build understanding
  const understanding = buildUnderstanding(agent, request, loadedContext);

  // 5. Get previous work if returning
  let previousWork: IntakeResponse["previousWork"];
  if (isReturning) {
    const { listThreads } = await import("./agent-memory.js");
    const threads = await listThreads(agent.agentId);
    previousWork = threads.slice(0, 10).map((t) => ({
      threadId: t.threadId,
      title: t.title,
      summary: t.summary,
      goal: t.goal,
      updatedAt: t.updatedAt,
    }));
  }

  return {
    agent,
    threadId,
    loadedContext,
    understanding,
    isReturning,
    previousWork,
  };
}

// ── Build Understanding ──────────────────────────────────────────────

function buildUnderstanding(
  agent: AgentProfile,
  request: IntakeRequest,
  loadedContext: { files: { path: string; lines: number; size: number }[]; totalSize: number },
): IntakeResponse["understanding"] {
  // Agent summary
  const agentParts: string[] = [];
  agentParts.push(`Agent "${agent.name}" (${agent.agentId})`);
  if (agent.description) agentParts.push(agent.description);
  if (agent.skills.length > 0) agentParts.push(`Skills: ${agent.skills.join(", ")}`);
  if (agent.techStack.length > 0) agentParts.push(`Stack: ${agent.techStack.join(", ")}`);

  // Task summary
  const taskParts: string[] = [];
  if (request.task) taskParts.push(`Current task: ${request.task}`);
  if (agent.goals.length > 0) taskParts.push(`Goals: ${agent.goals.join("; ")}`);
  if (agent.workspace.path) taskParts.push(`Working in: ${agent.workspace.path}`);

  // Context summary
  const ctxParts: string[] = [];
  if (loadedContext.files.length > 0) {
    ctxParts.push(`${loadedContext.files.length} files loaded (${(loadedContext.totalSize / 1024).toFixed(1)} KB)`);
  }
  if (agent.workspace.keyPaths.length > 0) {
    ctxParts.push(`Key paths: ${agent.workspace.keyPaths.join(", ")}`);
  }

  // Recommendations
  const recommendations: string[] = [];

  if (!request.task && agent.goals.length === 0) {
    recommendations.push("Provide a specific task or goals so G2M can route to the best model and effort level.");
  }
  if (request.contextPaths.length === 0 && !agent.workspace.path) {
    recommendations.push("Provide contextPaths or workspace.path so G2M can load relevant files for richer responses.");
  }
  if (agent.skills.length === 0) {
    recommendations.push("Describe your skills so G2M can tailor responses to your capabilities.");
  }
  if (!agent.systemPrompt && !request.systemPrompt) {
    recommendations.push("Consider providing a systemPrompt to customize how the model responds to you.");
  }
  if (loadedContext.files.length > 0 && loadedContext.totalSize > 200_000) {
    recommendations.push("Large context loaded. Consider narrowing contextPaths to the most relevant files for faster, focused responses.");
  }
  if (request.task && request.task.length > 500) {
    recommendations.push("Complex task detected. Using agency-claude with high effort is recommended. Set preferredModel: 'agency-claude'.");
  }

  return {
    agentSummary: agentParts.join(". "),
    taskSummary: taskParts.length > 0 ? taskParts.join(". ") : "No specific task provided. Ready for general queries.",
    contextSummary: ctxParts.length > 0 ? ctxParts.join(". ") : "No file context loaded.",
    recommendations,
  };
}

// ── Thread-Aware Chat ────────────────────────────────────────────────

export const ThreadChatRequestSchema = z.object({
  agentId: z.string(),
  threadId: z.string(),
  message: z.string().min(1),
  model: z.string().default("auto"),
  stream: z.boolean().default(false),
  "x-effort": z.enum(["low", "medium", "high", "max"]).optional(),
  /** Additional files to load into context for this message */
  contextPaths: z.array(z.string()).default([]),
});

export type ThreadChatRequest = z.infer<typeof ThreadChatRequestSchema>;

/**
 * Build a chat completion request from a thread-aware message.
 * Loads agent context, thread history, and any additional file context.
 */
export async function buildThreadChatRequest(
  request: ThreadChatRequest,
): Promise<{
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  model: string;
  effort?: "low" | "medium" | "high" | "max";
  agent: AgentProfile;
}> {
  const agent = await getAgent(request.agentId);
  if (!agent) throw new Error(`Agent not found: ${request.agentId}`);

  const { messages } = await buildContextMessages(
    request.agentId,
    request.threadId,
    request.message,
  );

  // Load additional context if provided
  if (request.contextPaths.length > 0) {
    try {
      const ctx = await loadContext(request.contextPaths, 300_000);
      if (ctx.length > 0) {
        const fileContent = ctx
          .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
          .join("\n\n");
        messages.splice(1, 0, {
          role: "system" as const,
          content: `File context:\n${fileContent}`,
          timestamp: Date.now(),
        });
      }
    } catch { /* best-effort */ }
  }

  return {
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    model: request.model !== "auto" ? request.model : (agent.preferredModel ?? "auto"),
    effort: request["x-effort"] ?? agent.preferredEffort,
    agent,
  };
}

/**
 * After a response is received, persist it to the thread.
 */
export async function persistResponse(
  agentId: string,
  threadId: string,
  userMessage: string,
  assistantContent: string,
  routing?: { backend: string; effort: string; reason: string },
): Promise<void> {
  const now = Date.now();
  await appendMessages(agentId, threadId, [
    { role: "user", content: userMessage, timestamp: now },
    { role: "assistant", content: assistantContent, timestamp: now, routing },
  ]);
}
