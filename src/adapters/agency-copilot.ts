import { CONFIG } from "../config.js";
import type { AdapterOptions, Message, ModelAdapter } from "../types.js";
import { lastUserMessage, spawnAndStream } from "./base.js";

/**
 * Agency Copilot adapter.
 *
 * Reserved for Microsoft-related work (ADO, WorkIQ, M365, Teams, etc.)
 * where MCP tool access is needed.
 *
 * Invokes `copilot.exe` CLI with --prompt for non-interactive mode.
 * Uses GitHub managed account (jiaqizou_microsoft) auth from Windows Credential Manager.
 */
export class AgencyCopilotAdapter implements ModelAdapter {
  readonly name = "agency-copilot";

  async *invoke(
    messages: readonly Message[],
    options: AdapterOptions,
  ): AsyncGenerator<string, void, unknown> {
    const prompt = lastUserMessage(messages);

    // Copilot CLI: -p/--prompt for non-interactive, -s for script-friendly output
    const args = [
      "--prompt",
      prompt,
      "--output-format",
      "text",
      "-s",
      "--allow-all",
    ];

    yield* spawnAndStream(CONFIG.cli.copilot, args, {
      timeoutMs: options.timeoutMs ?? CONFIG.timeoutMs,
      signal: options.signal,
    });
  }
}
