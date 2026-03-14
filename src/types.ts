import { z } from "zod";

// ── OpenAI-compatible request ────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const ChatCompletionRequestSchema = z.object({
  model: z.string().default("auto"),
  messages: z.array(MessageSchema).min(1),
  stream: z.boolean().default(false),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  /** Custom: override effort level for Agency Claude */
  "x-effort": z
    .enum(["low", "medium", "high", "max"])
    .optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type EffortLevel = "low" | "medium" | "high" | "max";

// ── OpenAI-compatible response ───────────────────────────────────────

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason: "stop" | "length" | "error";
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: { role?: "assistant"; content?: string };
    finish_reason: "stop" | null;
  }[];
}

// ── Adapter types ────────────────────────────────────────────────────

export interface AdapterOptions {
  effort?: EffortLevel;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ModelAdapter {
  readonly name: string;
  invoke(
    messages: readonly Message[],
    options: AdapterOptions,
  ): AsyncGenerator<string, void, unknown>;
}
