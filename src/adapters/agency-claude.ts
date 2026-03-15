import { CONFIG } from "../config.js";
import type { AdapterOptions, Message, ModelAdapter } from "../types.js";
import { formatPrompt, spawnAndStream } from "./base.js";

/**
 * Agency Claude adapter.
 *
 * Invokes `agency claude --prompt "..." --print` with dynamic effort level.
 * Effort can be overridden via AdapterOptions or auto-detected by the
 * effort classifier before reaching this adapter.
 */
export class AgencyClaudeAdapter implements ModelAdapter {
  readonly name = "agency-claude";

  async *invoke(
    messages: readonly Message[],
    options: AdapterOptions,
  ): AsyncGenerator<string, void, unknown> {
    const prompt = formatPrompt(messages);
    const effort = options.effort ?? "medium";

    // Agency CLI: --prompt is an Agency flag, --effort is passed through to Claude CLI
    const args = [
      "claude",
      "--prompt",
      prompt,
      "--",
      "--print",
      "--output-format",
      "text",
      "--effort",
      effort,
      "--permission-mode",
      "bypassPermissions",
    ];

    yield* spawnAndStream(CONFIG.cli.agency, args, {
      timeoutMs: options.timeoutMs ?? CONFIG.timeoutMs,
      signal: options.signal,
    });
  }
}
