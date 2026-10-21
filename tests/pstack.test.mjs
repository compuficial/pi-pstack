import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import register from "../src/extension.mjs";

// Exercise the registered handlers with the same boundaries Pi supplies.
function session(branch = []) {
  const commands = new Map();
  const events = new Map();
  const tools = new Map();
  const messages = [];
  const models = [
    { provider: "openai", id: "gpt-test" },
    { provider: "anthropic", id: "claude-test" },
  ];
  const pi = {
    registerCommand: (name, command) => commands.set(name, command),
    registerTool: (tool) => tools.set(tool.name, tool),
    on: (name, fn) => events.set(name, fn),
    getCommands: () => [],
    sendUserMessage: (text) => messages.push(text),
    sendMessage: (message) => messages.push(message.content),
    appendEntry: (customType, data) => branch.push({ type: "custom", customType, data }),
  };
  const ctx = {
    cwd: process.cwd(),
    model: models[0],
    hasUI: false,
    sessionManager: { getBranch: () => branch },
    modelRegistry: { getAvailable: () => models },
    ui: { setStatus() {}, notify() {} },
  };
  register(pi, {});
  return { pi, commands, events, tools, messages, ctx, branch };
}

test("commands load the full upstream skill and Pi adapter", async () => {
  const s = session();
  await s.commands.get("pstack-arena").handler("design a cache", s.ctx);
  assert.match(s.messages[0], /Phase A: Frame/);
  assert.match(s.messages[0], /pstack_run/);
  assert.match(s.messages[0], /design a cache/);
  assert.match(s.messages[0], /Base directory/);
});

test("poteto mode survives reload and follows the active session branch", async () => {
  const s = session();
  await s.commands.get("poteto-mode").handler("", s.ctx);
  assert.equal(s.branch.at(-1).data.isEnabled, true);
  const resumed = session(s.branch);
  await resumed.events.get("session_start")({}, resumed.ctx);
  const prompt = await resumed.events.get("before_agent_start")({ systemPrompt: "original" }, resumed.ctx);
  assert.match(prompt.systemPrompt, /^original/);
  assert.match(prompt.systemPrompt, /Poteto mode/);
  await resumed.commands.get("poteto-mode").handler("off", resumed.ctx);
  assert.equal(await resumed.events.get("before_agent_start")({ systemPrompt: "original" }, resumed.ctx), undefined);
  resumed.branch.splice(0);
  await resumed.events.get("session_tree")({}, resumed.ctx);
  assert.equal(await resumed.events.get("before_agent_start")({ systemPrompt: "original" }, resumed.ctx), undefined);
});

test("setup validates models and saves panel choices without a UI", async () => {
  const s = session();
  const cwd = await mkdtemp(join(tmpdir(), "pstack-config-"));
  s.ctx.cwd = cwd;
  try {
    await s.commands.get("setup-pstack").handler("interrogate reviewers=openai/gpt-test,anthropic/claude-test", s.ctx);
    const config = JSON.parse(await readFile(join(cwd, ".pi/pstack.json"), "utf8"));
    assert.deepEqual(config.roles["interrogate reviewers"], ["openai/gpt-test", "anthropic/claude-test"]);
    await assert.rejects(s.commands.get("setup-pstack").handler("swarm workers=missing/model", s.ctx), /Unavailable model/);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".pi/pstack.json"), "utf8")), config);
  } finally {
    await rm(cwd, { recursive: true });
  }
});

test("worker dispatch expands a configured panel and resolves parent aliases", async () => {
  const s = session();
  const calls = [];
  register(s.pi, {}, {
    loadConfig: async () => ({ roles: { "arena runners": ["auto", "anthropic/claude-test"] }, thinking: "high" }),
    runWorker: async (task) => {
      calls.push(task);
      return { model: task.model, output: "candidate", exitCode: 0, usage: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 5, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
    },
  });
  const result = await s.tools.get("pstack_run").execute("id", {
    tasks: [{ task: "design a cache", role: "arena runners", agent: "poteto-agent" }],
  }, undefined, undefined, s.ctx);
  assert.deepEqual(calls.map((call) => call.model), ["openai/gpt-test", "anthropic/claude-test"]);
  assert.equal(calls[0].thinking, "high");
  assert.match(calls[0].systemPrompt, /Poteto mode/);
  assert.equal(result.details.results.length, 2);
  assert.equal(result.usage.totalTokens, 10);
  assert.match(result.content[0].text, /candidate/);
});

test("a failed reviewer fails the tool and unavailable models never launch", async () => {
  const s = session();
  let launches = 0;
  register(s.pi, {}, {
    loadConfig: async () => ({ roles: {}, thinking: "medium" }),
    runWorker: async () => { launches++; return { exitCode: 1, output: "provider failed" }; },
  });
  const tool = s.tools.get("pstack_run");
  await assert.rejects(tool.execute("id", { tasks: [{ task: "review", model: "missing/model" }] }, undefined, undefined, s.ctx), /Unavailable model/);
  assert.equal(launches, 0);
  await assert.rejects(tool.execute("id", { tasks: [{ task: "review" }] }, undefined, undefined, s.ctx), /provider failed/);
});
