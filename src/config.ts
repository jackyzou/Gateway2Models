import { join } from "node:path";

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";

function intEnv(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

export const CONFIG = {
  port: intEnv("G2M_PORT", 5555),
  host: process.env.G2M_HOST ?? "127.0.0.1",

  /** Maximum concurrent CLI subprocess invocations */
  maxConcurrency: intEnv("G2M_MAX_CONCURRENCY", 5),

  /** Default timeout per request in ms (5 minutes) */
  timeoutMs: intEnv("G2M_TIMEOUT_MS", 300_000),

  cli: {
    claude: process.env.CLAUDE_CLI_PATH ?? join(HOME, ".claude-cli", "CurrentVersion", "claude.exe"),
    agency: process.env.AGENCY_CLI_PATH ?? join(
      HOME,
      "AppData",
      "Roaming",
      "agency",
      "CurrentVersion",
      "agency.exe",
    ),
    copilot: process.env.COPILOT_CLI_PATH ?? join(HOME, ".copilot-cli", "1.0.3", "copilot.exe"),
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    model: process.env.OLLAMA_MODEL ?? "llama3.1",
  },

  generation: {
    comfyuiBaseUrl: process.env.COMFYUI_BASE_URL ?? "http://localhost:7860",
    stabilityApiKey: process.env.STABILITY_API_KEY ?? "",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    replicateApiToken: process.env.REPLICATE_API_TOKEN ?? "",
  },

  lan: {
    enabled: process.env.G2M_LAN === "true" || process.argv.includes("--lan"),
  },

  /** Model aliases → backend mapping */
  models: {
    "vscode-claude": "vscode-claude",
    claude: "vscode-claude",
    "agency-claude": "agency-claude",
    "agency-copilot": "agency-copilot",
    copilot: "agency-copilot",
    ollama: "ollama",
    local: "ollama",
    auto: "auto",
  } as Record<string, string>,
} as const;
