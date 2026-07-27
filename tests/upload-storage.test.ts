import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getUploadsRoot,
  readUpload,
  saveUpload,
} from "../lib/upload-storage";

test("stores and reads an upload from the configured persistent directory", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "letson-uploads-"));
  const previous = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = directory;

  t.after(async () => {
    if (previous === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  });

  assert.equal(getUploadsRoot(), path.resolve(directory));

  const url = await saveUpload("payments", new Uint8Array([1, 2, 3]), "png");
  const match = url.match(/^\/api\/uploads\/payments\/(.+\.png)$/);
  assert.ok(match);

  const stored = await readUpload("payments", match[1]);
  assert.ok(stored);
  assert.equal(stored.contentType, "image/png");
  assert.deepEqual([...stored.bytes], [1, 2, 3]);
});

test("rejects unsafe file names and unsupported extensions", async () => {
  assert.equal(await readUpload("payments", "../secret.png"), null);
  await assert.rejects(
    saveUpload("menu", new Uint8Array([1]), "exe"),
    /Unsupported upload file extension/
  );
});
