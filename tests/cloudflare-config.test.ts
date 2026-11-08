import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
test("Cloudflare self-reference targets the actual production worker", () => {
  assert.equal(config.name, "isayfc-production");
  assert.equal(config.services.find((binding: { binding: string }) => binding.binding === "WORKER_SELF_REFERENCE")?.service, config.name);
  assert.equal(config.main, ".open-next/worker.js");
  assert.equal(config.assets.directory, ".open-next/assets");
  assert.equal(config.assets.binding, "ASSETS");
  assert.ok(config.compatibility_flags.includes("nodejs_compat"));
});
test("Cloudflare config preserves variables without committing secrets or enabling public preview URLs", () => {
  assert.equal(config.keep_vars, true);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.vars, undefined);
  assert.equal(config.build.command, "npm run build:cloudflare");
  const ignores = readFileSync(".gitignore", "utf8");
  for (const value of [".dev.vars*", "/.wrangler/", "/.open-next/"]) assert.ok(ignores.includes(value));
});
