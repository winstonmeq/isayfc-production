import assert from "node:assert/strict";
import test from "node:test";

import {
  LoginRateLimiter,
  loginRateLimitKey,
} from "../lib/login-rate-limit";

test("blocks after the configured number of failed logins", () => {
  const limiter = new LoginRateLimiter(3, 60_000, 30_000);
  const key = "cashier";
  const now = 1_000_000;

  assert.equal(limiter.check(key, now).allowed, true);
  assert.equal(limiter.recordFailure(key, now).allowed, true);
  assert.equal(limiter.recordFailure(key, now + 1).allowed, true);

  const blocked = limiter.recordFailure(key, now + 2);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 30);
});

test("successful login clearing removes accumulated failures", () => {
  const limiter = new LoginRateLimiter(2, 60_000, 30_000);
  limiter.recordFailure("cashier", 100);
  limiter.clear("cashier");

  assert.equal(limiter.check("cashier", 101).remaining, 2);
  assert.equal(limiter.recordFailure("cashier", 102).allowed, true);
});

test("expired windows and blocks allow login attempts again", () => {
  const limiter = new LoginRateLimiter(1, 10_000, 5_000);
  assert.equal(limiter.recordFailure("cashier", 1_000).allowed, false);
  assert.equal(limiter.check("cashier", 6_001).allowed, true);
});

test("rate-limit keys do not expose usernames and separate client IPs", () => {
  const first = loginRateLimitKey("Cashier", "203.0.113.1");
  const normalized = loginRateLimitKey(" cashier ", "203.0.113.1");
  const secondIp = loginRateLimitKey("cashier", "203.0.113.2");

  assert.equal(first, normalized);
  assert.notEqual(first, secondIp);
  assert.equal(first.includes("cashier"), false);
});
