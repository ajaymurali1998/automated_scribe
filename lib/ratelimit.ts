// Rate limiting. Uses Upstash Redis when configured (shared across serverless
// instances); otherwise falls back to a best-effort in-memory limiter so the app
// runs locally and before Upstash is set up.
//
// Keyed by IP rather than user id — there is no login. A per-IP cap is bypassable
// (VPN, incognito), so it's a speed bump, not the real ceiling. The GLOBAL cap plus
// the Anthropic console's monthly spend cap are what actually bound cost — set the
// console cap before sharing the URL, not after.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasUpstash = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

// Claude calls cost money, so the global daily cap is the real cost ceiling for a
// single unauthenticated deployment shared by however many people find the URL.
export const STRUCTURE_PER_IP_DAY = 60;
export const STRUCTURE_GLOBAL_PER_DAY = 200;
// Token mints are cheap, but each one opens a billable Deepgram stream.
export const TOKENS_PER_IP_HOUR = 120;

const BURST = 12;
const BURST_WINDOW_MS = 60_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

let rlBurst: Ratelimit | null = null;
let rlStructureIp: Ratelimit | null = null;
let rlStructureGlobal: Ratelimit | null = null;
let rlTokens: Ratelimit | null = null;

if (hasUpstash) {
  const redis = Redis.fromEnv();
  rlBurst = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(BURST, "1 m"), prefix: "rx:burst" });
  rlStructureIp = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(STRUCTURE_PER_IP_DAY, "1 d"),
    prefix: "rx:structure:ip",
  });
  rlStructureGlobal = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(STRUCTURE_GLOBAL_PER_DAY, "1 d"),
    prefix: "rx:structure:global",
  });
  rlTokens = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(TOKENS_PER_IP_HOUR, "1 h"), prefix: "rx:token" });
}

// ---- in-memory fallback ----
const mem = new Map<string, number[]>();
function memAllow(bucket: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (mem.get(bucket) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    mem.set(bucket, arr);
    return false;
  }
  arr.push(now);
  mem.set(bucket, arr);
  return true;
}

const BURST_MSG = "Too many requests — slow down a moment.";
const IP_MSG = `Daily limit reached (${STRUCTURE_PER_IP_DAY} prescriptions from this connection). Try again tomorrow.`;
const GLOBAL_MSG = "This app is at capacity for today — please try again tomorrow.";
const TOKEN_MSG = "Too many recordings started recently. Wait a minute and try again.";

export type LimitResult = { ok: boolean; reason?: string };

// Order: burst -> per-IP -> global. An IP already over its own daily cap is stopped
// before the global counter is touched, so one runaway connection can't eat the
// shared budget that everyone else's requests are checked against.
export async function limitStructure(ip: string): Promise<LimitResult> {
  const key = ip || "unknown";
  if (hasUpstash && rlBurst && rlStructureIp && rlStructureGlobal) {
    if (!(await rlBurst.limit(`s:${key}`)).success) return { ok: false, reason: BURST_MSG };
    if (!(await rlStructureIp.limit(key)).success) return { ok: false, reason: IP_MSG };
    if (!(await rlStructureGlobal.limit("global")).success) return { ok: false, reason: GLOBAL_MSG };
    return { ok: true };
  }
  if (!memAllow(`burst:s:${key}`, BURST, BURST_WINDOW_MS)) return { ok: false, reason: BURST_MSG };
  if (!memAllow(`structure:ip:${key}`, STRUCTURE_PER_IP_DAY, DAY_MS)) return { ok: false, reason: IP_MSG };
  if (!memAllow(`structure:global`, STRUCTURE_GLOBAL_PER_DAY, DAY_MS)) return { ok: false, reason: GLOBAL_MSG };
  return { ok: true };
}

export async function limitTokenMint(ip: string): Promise<LimitResult> {
  const key = ip || "unknown";
  if (hasUpstash && rlTokens) {
    if (!(await rlTokens.limit(key)).success) return { ok: false, reason: TOKEN_MSG };
    return { ok: true };
  }
  if (!memAllow(`token:${key}`, TOKENS_PER_IP_HOUR, HOUR_MS)) return { ok: false, reason: TOKEN_MSG };
  return { ok: true };
}

export function clientIp(req: Request): string {
  const h = (n: string) => req.headers.get(n) || "";
  const fwd = h("x-forwarded-for").split(",")[0].trim();
  return fwd || h("x-real-ip") || "unknown";
}
