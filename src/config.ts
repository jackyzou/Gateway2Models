import { join } from "node:path";

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";

export const CONFIG = {
  port: 5555,
  host: "127.0.0.1",

  /** Maximum concurrent CLI subprocess invocations */
  maxConcurrency: 5,

  /** Default timeout per request in ms (5 minutes) */
  timeoutMs: 300_000,

  cli: {
    claude: join(HOME, ".claude-cli", "CurrentVersion", "claude.exe"),
    agency: join(
      HOME,
      "AppData",
      "Roaming",
      "agency",
      "CurrentVersion",
      "agency.exe",
    ),
    copilot: join(HOME, ".copilot-cli", "1.0.3", "copilot.exe"),
  },

  /** Model aliases → backend mapping */
  models: {
    "vscode-claude": "vscode-claude",
    claude: "vscode-claude",
    "agency-claude": "agency-claude",
    "agency-copilot": "agency-copilot",
    copilot: "agency-copilot",
    auto: "auto",
  } as Record<string, string>,
} as const;
