import type { AdapterOptions, Message, ModelAdapter } from "../types.js";

/**
 * Generic HTTP adapter for any OpenAI-compatible endpoint.
 *
 * Works with: Direct Anthropic API, OpenAI, Azure OpenAI, Groq,
 * Together AI, or any self-hosted OpenAI-compatible server.
 */
export class HttpAdapter implements ModelAdapter {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
  }) {
    this.name = opts.name;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey ?? "";
    this.model = opts.model;
  }

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
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      }

      const body = response.body;
      if (!body) throw new Error("No response body");

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
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as {
              choices?: { delta?: { content?: string } }[];
            };
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch { /* skip */ }
        }
      }
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
}
