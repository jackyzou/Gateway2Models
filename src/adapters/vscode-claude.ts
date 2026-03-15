import { CONFIG } from "../config.js";
import type { AdapterOptions, Message, ModelAdapter } from "../types.js";
import { formatPrompt, spawnAndStream } from "./base.js";

/**
 * VS Code Claude CLI adapter.
 *
 * Invokes `claude --print --output-format text` with the conversation
 * piped via stdin (most reliable for complex/long prompts).
 * Auth: Uses GitHub managed account sign-in stored in ~/.claude.json
 */
export class VsCodeClaudeAdapter implements ModelAdapter {
  readonly name = "vscode-claude";

  async *invoke(
    messages: readonly Message[],
    options: AdapterOptions,
  ): AsyncGenerator<string, void, unknown> {
    const prompt = formatPrompt(messages);

    const args = [
      "--print",
      "--output-format",
      "text",
      "--model",
      "opus[1m]",
      "--permission-mode",
      "bypassPermissions",
    ];

    yield* spawnAndStream(CONFIG.cli.claude, args, {
      stdin: prompt,
      timeoutMs: options.timeoutMs ?? CONFIG.timeoutMs,
      signal: options.signal,
    });
  }
}
