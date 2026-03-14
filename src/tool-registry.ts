import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
const TOOLS_DIR = join(HOME, ".g2m", "tools");

// ── Tool Registration Schema ─────────────────────────────────────────

export const ToolDefinitionSchema = z.object({
  /** Unique tool name */
  name: z.string().min(1).max(64),
  /** Human-readable description */
  description: z.string(),
  /** JSON Schema for tool parameters */
  parameters: z.record(z.unknown()).default({}),
  /** The agent that registered this tool */
  registeredBy: z.string(),
  /** HTTP endpoint to call this tool (POST) */
  endpoint: z.string().url().optional(),
  /** Or: inline instruction for the model to follow */
  instruction: z.string().optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema> & {
  registeredAt: number;
};

// ── Tool Store ───────────────────────────────────────────────────────

const tools = new Map<string, ToolDefinition>();

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

function toolPath(name: string): string {
  return join(TOOLS_DIR, `${name}.json`);
}

/** Load all persisted tools on startup */
export async function loadTools(): Promise<void> {
  try {
    await ensureDir(TOOLS_DIR);
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(TOOLS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(TOOLS_DIR, file), "utf-8");
        const tool = JSON.parse(raw) as ToolDefinition;
        tools.set(tool.name, tool);
      } catch { /* skip corrupt files */ }
    }
  } catch { /* first run */ }
}

/** Register a new tool (or update existing) */
export async function registerTool(input: z.infer<typeof ToolDefinitionSchema>): Promise<ToolDefinition> {
  const tool: ToolDefinition = {
    ...input,
    registeredAt: Date.now(),
  };

  tools.set(tool.name, tool);

  // Persist
  await ensureDir(TOOLS_DIR);
  await writeFile(toolPath(tool.name), JSON.stringify(tool, null, 2), "utf-8");

  return tool;
}

/** Get a tool by name */
export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

/** List all registered tools */
export function listTools(agentId?: string): ToolDefinition[] {
  const all = [...tools.values()];
  if (agentId) {
    return all.filter((t) => t.registeredBy === agentId);
  }
  return all;
}

/** Remove a tool */
export async function removeTool(name: string): Promise<boolean> {
  if (!tools.has(name)) return false;
  tools.delete(name);
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(toolPath(name));
  } catch { /* already gone */ }
  return true;
}

/** Build tool descriptions for insertion into system prompt */
export function buildToolContext(agentId?: string): string {
  const agentTools = listTools(agentId);
  if (agentTools.length === 0) return "";

  const lines = ["Available tools:"];
  for (const tool of agentTools) {
    lines.push(`- **${tool.name}**: ${tool.description}`);
    if (tool.instruction) {
      lines.push(`  Instruction: ${tool.instruction}`);
    }
    if (tool.endpoint) {
      lines.push(`  Endpoint: POST ${tool.endpoint}`);
    }
    if (Object.keys(tool.parameters).length > 0) {
      lines.push(`  Parameters: ${JSON.stringify(tool.parameters)}`);
    }
  }
  return lines.join("\n");
}
