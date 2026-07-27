import crypto from "node:crypto";

type Attempt = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
};

export type LoginRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_BLOCK_MS = 15 * 60 * 1000;

export class LoginRateLimiter {
  private readonly attempts = new Map<string, Attempt>();

  constructor(
    private readonly maxFailures = DEFAULT_MAX_FAILURES,
    private readonly windowMs = DEFAULT_WINDOW_MS,
    private readonly blockMs = DEFAULT_BLOCK_MS
  ) {}

  check(key: string, now = Date.now()): LoginRateLimitResult {
    const attempt = this.attempts.get(key);
    if (!attempt) {
      return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: this.maxFailures,
      };
    }

    if (attempt.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((attempt.blockedUntil - now) / 1000)
        ),
        remaining: 0,
      };
    }

    if (now - attempt.windowStartedAt >= this.windowMs) {
      this.attempts.delete(key);
      return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: this.maxFailures,
      };
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, this.maxFailures - attempt.failures),
    };
  }

  recordFailure(key: string, now = Date.now()): LoginRateLimitResult {
    const current = this.attempts.get(key);
    const attempt =
      !current || now - current.windowStartedAt >= this.windowMs
        ? { failures: 0, windowStartedAt: now, blockedUntil: 0 }
        : current;

    attempt.failures += 1;
    if (attempt.failures >= this.maxFailures) {
      attempt.blockedUntil = now + this.blockMs;
    }
    this.attempts.set(key, attempt);

    return this.check(key, now);
  }

  clear(key: string) {
    this.attempts.delete(key);
  }

  prune(now = Date.now()) {
    for (const [key, attempt] of this.attempts) {
      const expired =
        attempt.blockedUntil <= now &&
        now - attempt.windowStartedAt >= this.windowMs;
      if (expired) this.attempts.delete(key);
    }
  }
}

declare global {
  var letsonLoginRateLimiter: LoginRateLimiter | undefined;
}

export const loginRateLimiter =
  global.letsonLoginRateLimiter ?? new LoginRateLimiter();

if (!global.letsonLoginRateLimiter) {
  global.letsonLoginRateLimiter = loginRateLimiter;
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function loginRateLimitKey(identifier: string, clientIp?: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const raw = clientIp
    ? `${clientIp}:${normalizedIdentifier}`
    : `account:${normalizedIdentifier}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}
