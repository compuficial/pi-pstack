import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runWorker } from "../src/worker.mjs";

// A local child process verifies Pi's JSON protocol without spending API tokens.
async function fakePi(source, task) {
  const dir = await mkdtemp(join(tmpdir(), "pstack-fake-"));
  const file = join(dir, "pi.mjs");
  await writeFile(file, source);
  try {
    return await task({ command: process.execPath, args: [file] });
  } finally {
    await rm(dir, { recursive: true });
  }
}

test("workers read final output, usage, and preserve their complete transcript", async () => {
  await fakePi(`
    const message = { role: "assistant", content: [{ type: "text", text: "verified" }], stopReason: "stop", usage: { input: 2, output: 3, totalTokens: 5, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } } };
    console.log(JSON.stringify({ type: "message_end", message }));
  `, async (invocation) => {
    const result = await runWorker({ task: "review", model: "openai/gpt-test", thinking: "high", cwd: process.cwd(), systemPrompt: "Read the skill" }, undefined, invocation);
    try {
      assert.equal(result.output, "verified");
      assert.equal(result.exitCode, 0);
      assert.equal(result.usage.totalTokens, 5);
      assert.match(await readFile(result.transcript, "utf8"), /message_end/);
      assert.match(await readFile(result.prompt, "utf8"), /Read the skill/);
    } finally {
      await rm(result.directory, { recursive: true });
    }
  });
});

test("provider errors fail even when the Pi process exits zero", async () => {
  await fakePi(`console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "auth expired" } }));`, async (invocation) => {
    const result = await runWorker({ task: "review", model: "openai/gpt-test", cwd: process.cwd(), systemPrompt: "review" }, undefined, invocation);
    try {
      assert.equal(result.exitCode, 1);
      assert.match(result.output, /auth expired/);
    } finally {
      await rm(result.directory, { recursive: true });
    }
  });
});

test("aborting a worker terminates the process", async () => {
  await fakePi(`setInterval(() => {}, 1000);`, async (invocation) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      await assert.rejects(runWorker({ task: "review", model: "openai/gpt-test", cwd: process.cwd(), systemPrompt: "review" }, controller.signal, invocation), /abort/i);
    } finally {
      clearTimeout(timer);
    }
  });
});
