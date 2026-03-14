import { z } from "zod";

// ── Multi-modal content parts (OpenAI vision format) ─────────────────

const TextContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ImageContentPartSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(["auto", "low", "high"]).default("auto"),
  }),
});

const AudioContentPartSchema = z.object({
  type: z.literal("input_audio"),
  input_audio: z.object({
    data: z.string(),
    format: z.enum(["wav", "mp3", "flac", "webm"]).default("wav"),
  }),
});

const ContentPartSchema = z.discriminatedUnion("type", [
  TextContentPartSchema,
  ImageContentPartSchema,
  AudioContentPartSchema,
]);

// ── OpenAI-compatible request ────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([z.string(), z.array(ContentPartSchema)]),
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
export type ContentPart = z.infer<typeof ContentPartSchema>;
export type EffortLevel = "low" | "medium" | "high" | "max";

/** Extract text content from a message (handles both string and content parts) */
export function extractTextContent(message: Message): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((p): p is z.infer<typeof TextContentPartSchema> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/** Check if a message contains multi-modal content (images, audio) */
export function hasMultiModalContent(messages: readonly Message[]): boolean {
  return messages.some((m) => {
    if (typeof m.content === "string") return false;
    return m.content.some((p) => p.type !== "text");
  });
}

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
