import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
const LAN_POLICY_PATH = join(HOME, ".g2m", "lan-policy.json");

// ── LAN Policy Schema ────────────────────────────────────────────────

const LanPolicySchema = z.object({
  /** "allow" = only listed IPs can access; "deny" = listed IPs are blocked */
  mode: z.enum(["allow", "deny"]).default("allow"),
  /** IP patterns (supports * wildcard: "192.168.1.*") */
  ips: z.array(z.string()).default(["192.168.*.*", "10.*.*.*", "172.16.*.*"]),
  /** Always-allowed IPs (localhost) */
  alwaysAllow: z.array(z.string()).default(["127.0.0.1", "::1", "::ffff:127.0.0.1"]),
});

export type LanPolicy = z.infer<typeof LanPolicySchema>;

let cachedPolicy: LanPolicy | null = null;

export async function loadLanPolicy(): Promise<LanPolicy> {
  try {
    const raw = await readFile(LAN_POLICY_PATH, "utf-8");
    const parsed = LanPolicySchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      cachedPolicy = parsed.data;
      return parsed.data;
    }
  } catch {
    // File doesn't exist — use defaults (allow private ranges)
  }
  cachedPolicy = LanPolicySchema.parse({});
  return cachedPolicy;
}

export function getLanPolicy(): LanPolicy {
  return cachedPolicy ?? LanPolicySchema.parse({});
}

export async function saveLanPolicy(policy: LanPolicy): Promise<void> {
  cachedPolicy = policy;
  await mkdir(join(HOME, ".g2m"), { recursive: true });
  await writeFile(LAN_POLICY_PATH, JSON.stringify(policy, null, 2), "utf-8");
}

// ── IP Matching ──────────────────────────────────────────────────────

function ipMatchesPattern(ip: string, pattern: string): boolean {
  // Normalize IPv6-mapped IPv4 (::ffff:192.168.1.1 → 192.168.1.1)
  const normalizedIp = ip.replace(/^::ffff:/, "");
  const normalizedPattern = pattern.replace(/^::ffff:/, "");

  const ipParts = normalizedIp.split(".");
  const patParts = normalizedPattern.split(".");

  if (ipParts.length !== patParts.length) return normalizedIp === normalizedPattern;

  return patParts.every((pat, i) => pat === "*" || pat === ipParts[i]);
}

function isIpAllowed(ip: string, policy: LanPolicy): boolean {
  // Always allow localhost
  if (policy.alwaysAllow.some((p) => ipMatchesPattern(ip, p))) return true;

  if (policy.mode === "allow") {
    return policy.ips.some((p) => ipMatchesPattern(ip, p));
  } else {
    // deny mode: block if IP matches any deny pattern
    return !policy.ips.some((p) => ipMatchesPattern(ip, p));
  }
}

// ── Express Middleware ────────────────────────────────────────────────

export function lanGuardMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const policy = getLanPolicy();
    const clientIp = req.ip ?? req.socket.remoteAddress ?? "";

    if (!isIpAllowed(clientIp, policy)) {
      res.status(403).json({
        error: { message: `Access denied for IP: ${clientIp}` },
      });
      return;
    }

    // Add CORS headers for LAN browser access
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-effort, x-request-id");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}

/** Determine the bind address based on LAN mode */
export function getBindAddress(): string {
  const lanMode = process.env.G2M_LAN === "true"
    || process.argv.includes("--lan");

  if (lanMode) {
    return "0.0.0.0";
  }

  return process.env.G2M_HOST ?? "127.0.0.1";
}

/** Check if running in LAN mode */
export function isLanMode(): boolean {
  return process.env.G2M_LAN === "true" || process.argv.includes("--lan");
}
