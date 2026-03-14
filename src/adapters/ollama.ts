import type { AdapterOptions, Message, ModelAdapter } from "../types.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

/**
 * Ollama adapter — HTTP-based, no CLI subprocess needed.
 *
 * Connects to a local Ollama instance for offline/private LLM inference.
 * Uses the Ollama chat API: POST /api/chat
 */
export class OllamaAdapter implements ModelAdapter {
  readonly name = "ollama";

  async *invoke(
    messages: readonly Message[],
    options: AdapterOptions,
  ): AsyncGenerator<string, void, unknown> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const timer = options.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Ollama error ${response.status}: ${text.slice(0, 200)}`,
        );
      }

      const body = response.body;
      if (!body) throw new Error("No response body from Ollama");

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
            };
            const content = parsed.message?.content;
            if (content) yield content;
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer) as {
            message?: { content?: string };
          };
          const content = parsed.message?.content;
          if (content) yield content;
        } catch {
          // Skip
        }
      }
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
}
