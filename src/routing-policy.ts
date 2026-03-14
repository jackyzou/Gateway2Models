import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
const POLICY_PATH = process.env.G2M_ROUTING_POLICY ?? join(HOME, ".g2m", "routing-policy.json");

// ── Policy schema ────────────────────────────────────────────────────

const RoutingRuleSchema = z.object({
  /** Rule name for logging */
  name: z.string(),
  /** Keywords that trigger this rule (OR logic) */
  keywords: z.array(z.string()).default([]),
  /** Regex patterns to match against prompt (OR logic) */
  patterns: z.array(z.string()).default([]),
  /** Agent IDs this rule applies to (empty = all) */
  agentIds: z.array(z.string()).default([]),
  /** Minimum prompt length to trigger */
  minLength: z.number().int().min(0).default(0),
  /** Backend to route to */
  backend: z.string(),
  /** Override effort level */
  effort: z.enum(["low", "medium", "high", "max"]).optional(),
  /** Priority (higher = checked first) */
  priority: z.number().int().default(0),
  /** Whether this rule is enabled */
  enabled: z.boolean().default(true),
});

const RoutingPolicySchema = z.object({
  version: z.string().default("1"),
  /** Default backend when no rules match */
  defaultBackend: z.string().default("auto"),
  /** Custom routing rules (checked in priority order) */
  rules: z.array(RoutingRuleSchema).default([]),
  /** A/B test configurations */
  abTests: z.array(z.object({
    name: z.string(),
    /** Percentage of requests to route to variant (0-100) */
    variantPercent: z.number().min(0).max(100).default(50),
    /** Control backend */
    control: z.string(),
    /** Variant backend */
    variant: z.string(),
    /** Only for specific agent IDs (empty = all) */
    agentIds: z.array(z.string()).default([]),
    enabled: z.boolean().default(true),
  })).default([]),
  /** Per-backend budget limits (estimated USD) */
  budgets: z.record(z.object({
    maxDailyUsd: z.number().optional(),
    maxMonthlyUsd: z.number().optional(),
  })).default({}),
});

export type RoutingPolicy = z.infer<typeof RoutingPolicySchema>;
export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

// ── Policy loading ───────────────────────────────────────────────────

let cachedPolicy: RoutingPolicy | null = null;

export async function loadPolicy(): Promise<RoutingPolicy> {
  try {
    const raw = await readFile(POLICY_PATH, "utf-8");
    const parsed = RoutingPolicySchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      cachedPolicy = parsed.data;
      return parsed.data;
    }
    console.warn("[policy] Invalid policy file, using defaults:", parsed.error.flatten());
  } catch {
    // File doesn't exist — use defaults
  }
  cachedPolicy = RoutingPolicySchema.parse({});
  return cachedPolicy;
}

export function getPolicy(): RoutingPolicy {
  return cachedPolicy ?? RoutingPolicySchema.parse({});
}

// ── Rule matching ────────────────────────────────────────────────────

export interface PolicyMatch {
  matched: boolean;
  rule?: RoutingRule;
  abTest?: { name: string; isVariant: boolean; backend: string };
  backend?: string;
  effort?: "low" | "medium" | "high" | "max";
}

export function applyPolicy(
  promptText: string,
  agentId?: string,
): PolicyMatch {
  const policy = getPolicy();
  const lower = promptText.toLowerCase();

  // Check custom rules (sorted by priority desc)
  const sortedRules = [...policy.rules]
    .filter((r) => r.enabled)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    // Agent filter
    if (rule.agentIds.length > 0 && agentId && !rule.agentIds.includes(agentId)) continue;

    // Length check
    if (promptText.length < rule.minLength) continue;

    // Keyword match
    const keywordMatch = rule.keywords.length === 0 || rule.keywords.some((kw) => lower.includes(kw.toLowerCase()));

    // Pattern match
    let patternMatch = rule.patterns.length === 0;
    if (!patternMatch) {
      for (const pat of rule.patterns) {
        try {
          if (new RegExp(pat, "i").test(promptText)) {
            patternMatch = true;
            break;
          }
        } catch { /* invalid regex, skip */ }
      }
    }

    if (keywordMatch && patternMatch) {
      return { matched: true, rule, backend: rule.backend, effort: rule.effort };
    }
  }

  // Check A/B tests
  for (const ab of policy.abTests) {
    if (!ab.enabled) continue;
    if (ab.agentIds.length > 0 && agentId && !ab.agentIds.includes(agentId)) continue;

    const isVariant = Math.random() * 100 < ab.variantPercent;
    return {
      matched: true,
      abTest: {
        name: ab.name,
        isVariant,
        backend: isVariant ? ab.variant : ab.control,
      },
      backend: isVariant ? ab.variant : ab.control,
    };
  }

  return { matched: false };
}
