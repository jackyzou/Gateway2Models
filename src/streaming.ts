import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { ChatCompletionChunk, ChatCompletionResponse, ModelAdapter, AdapterOptions, Message } from "./types.js";

/** Approximate token count (rough: 1 token ≈ 4 chars) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function makeId(): string {
  return `chatcmpl-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

// ── SSE Streaming ────────────────────────────────────────────────────

export async function handleStreaming(
  res: Response,
  adapter: ModelAdapter,
  messages: readonly Message[],
  options: AdapterOptions,
): Promise<void> {
  const id = makeId();
  const created = Math.floor(Date.now() / 1000);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Send initial role chunk
  const roleChunk: ChatCompletionChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model: adapter.name,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  };
  res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

  try {
    for await (const text of adapter.invoke(messages, options)) {
      if (res.destroyed) break;

      const chunk: ChatCompletionChunk = {
        id,
        object: "chat.completion.chunk",
        created,
        model: adapter.name,
        choices: [
          { index: 0, delta: { content: text + "\n" }, finish_reason: null },
        ],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    // Send finish chunk
    const doneChunk: ChatCompletionChunk = {
      id,
      object: "chat.completion.chunk",
      created,
      model: adapter.name,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    };
    res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
    res.write("data: [DONE]\n\n");
  } catch (err) {
    const errChunk: ChatCompletionChunk = {
      id,
      object: "chat.completion.chunk",
      created,
      model: adapter.name,
      choices: [{ index: 0, delta: { content: `\n\n[Error: ${err instanceof Error ? err.message : String(err)}]` }, finish_reason: "stop" }],
    };
    res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
    res.write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
}

// ── Non-streaming ────────────────────────────────────────────────────

export async function handleNonStreaming(
  adapter: ModelAdapter,
  messages: readonly Message[],
  options: AdapterOptions,
): Promise<ChatCompletionResponse> {
  const id = makeId();
  const created = Math.floor(Date.now() / 1000);
  const parts: string[] = [];

  for await (const text of adapter.invoke(messages, options)) {
    parts.push(text);
  }

  const content = parts.join("\n");
  const promptText = messages.map((m) => m.content).join(" ");

  return {
    id,
    object: "chat.completion",
    created,
    model: adapter.name,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: estimateTokens(promptText),
      completion_tokens: estimateTokens(content),
      total_tokens: estimateTokens(promptText) + estimateTokens(content),
    },
  };
}
