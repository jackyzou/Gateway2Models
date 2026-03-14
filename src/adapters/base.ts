import { spawn, type ChildProcess } from "node:child_process";
import type { Message } from "../types.js";

/**
 * Spawn a CLI process and yield its stdout line-by-line.
 * Rejects on non-zero exit or timeout.
 */
export async function* spawnAndStream(
  command: string,
  args: readonly string[],
  opts: {
    stdin?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    env?: Record<string, string>;
  } = {},
): AsyncGenerator<string, void, unknown> {
  const child: ChildProcess = spawn(command, args as string[], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    // Inherit full process environment so CLI tools can access auth credentials
    // stored in user profile, Windows Credential Manager, and config files.
    env: { ...process.env, ...opts.env },
  });

  // Write stdin if provided, then close
  if (opts.stdin != null) {
    child.stdin?.write(opts.stdin);
    child.stdin?.end();
  } else {
    child.stdin?.end();
  }

  // Abort handling
  const onAbort = () => child.kill();
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  // Timeout handling
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (opts.timeoutMs) {
    timer = setTimeout(() => {
      child.kill();
    }, opts.timeoutMs);
  }

  try {
    // Collect stderr for error reporting
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Yield stdout chunks as they arrive
    const stdout = child.stdout;
    if (!stdout) throw new Error("No stdout stream from child process");

    let buffer = "";
    for await (const chunk of stdout) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      // Keep last partial line in buffer
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield line;
      }
    }
    // Flush remaining buffer
    if (buffer.trim()) yield buffer;

    // Wait for process to exit
    const exitCode = await new Promise<number | null>((resolve) => {
      if (child.exitCode != null) {
        resolve(child.exitCode);
      } else {
        child.on("exit", (code) => resolve(code));
      }
    });

    if (exitCode !== 0 && exitCode != null) {
      throw new Error(
        `Process exited with code ${exitCode}${stderr ? `: ${stderr.slice(0, 500)}` : ""}`,
      );
    }
  } finally {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/** Format messages array into a single prompt string for CLI tools */
export function formatPrompt(messages: readonly Message[]): string {
  return messages
    .map((m) => {
      switch (m.role) {
        case "system":
          return `[System]: ${m.content}`;
        case "user":
          return `[User]: ${m.content}`;
        case "assistant":
          return `[Assistant]: ${m.content}`;
      }
    })
    .join("\n\n");
}

/** Extract just the last user message content */
export function lastUserMessage(messages: readonly Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return messages[messages.length - 1].content;
}
