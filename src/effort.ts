import type { EffortLevel, Message } from "./types.js";

const LOW_KEYWORDS = [
  "quick",
  "brief",
  "tl;dr",
  "tldr",
  "short",
  "one-liner",
  "yes or no",
  "simple",
  "eli5",
];

const HIGH_KEYWORDS = [
  "detailed",
  "analyze",
  "review",
  "explain thoroughly",
  "step by step",
  "step-by-step",
  "in depth",
  "in-depth",
  "breakdown",
  "break down",
  "compare",
  "evaluate",
  "debug",
  "refactor",
];

const MAX_KEYWORDS = [
  "comprehensive",
  "deep dive",
  "deep-dive",
  "architecture",
  "system design",
  "full analysis",
  "exhaustive",
  "thorough",
  "redesign",
  "implement entire",
  "complete implementation",
  "multi-file",
];

/**
 * Classify the effort level based on prompt content and length.
 *
 * Heuristic:
 *  1. Check for explicit keyword matches (strongest signal)
 *  2. Fall back to prompt length as secondary signal
 */
export function classifyEffort(messages: readonly Message[]): EffortLevel {
  const fullText = messages.map((m) => m.content).join(" ");
  const lower = fullText.toLowerCase();
  const charLen = fullText.length;

  // Keyword matching — most specific first
  if (MAX_KEYWORDS.some((kw) => lower.includes(kw))) return "max";
  if (HIGH_KEYWORDS.some((kw) => lower.includes(kw))) return "high";
  if (LOW_KEYWORDS.some((kw) => lower.includes(kw))) return "low";

  // Length-based fallback
  if (charLen > 2000) return "max";
  if (charLen > 500) return "high";
  if (charLen < 100) return "low";

  return "medium";
}
