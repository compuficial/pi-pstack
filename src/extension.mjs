import { readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorker } from "./worker.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SKILLS = join(ROOT, "vendor/pstack/skills");
const ADAPTER = `${readFileSync(join(ROOT, "docs/pi-runtime.md"), "utf8")}\nPi pstack package directory: ${ROOT}`;
const STATE = "pstack-mode";
const MAX_TASKS = 8;
const CONCURRENCY = 4;
const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export const ROLES = [
  "feature, refactoring", "bug-fix", "perf-issue", "hillclimb",
  "judgment and prose", "hardest tasks", "how explorer", "how explainer",
  "why investigators", "why synthesizer", "reflect tooling",
  "reflect judgment, divergent, synthesizer", "arena runners",
  "arena cross-judge pool", "swarm workers", "architect runners", "interrogate reviewers",
];
const NAMES = readdirSync(SKILLS).sort();

// Resolve upstream references from their original directories without editing the source.
function skillPrompt(name) {
  const directory = join(SKILLS, name);
  return `${ADAPTER}\n\nBase directory for this skill: ${directory}\n\n${readFileSync(join(directory, "SKILL.md"), "utf8")}`;
}

function configPath(cwd) {
  return join(cwd, ".pi/pstack.json");
}

async function loadConfig(cwd) {
  let config;
  try {
    config = JSON.parse(await readFile(configPath(cwd), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return { roles: {}, thinking: "high" };
    }
    throw error;
  }

  // Reject malformed configuration at the file boundary before any worker starts.
  if (!config || typeof config.roles !== "object" || !config.roles || Array.isArray(config.roles) || !THINKING.includes(config.thinking)) {
    throw new Error(`Invalid pstack configuration: ${configPath(cwd)}`);
  }
  for (const [role, models] of Object.entries(config.roles)) {
    if (!ROLES.includes(role) || !Array.isArray(models) || models.length < 1 || models.length > MAX_TASKS || models.some((model) => typeof model !== "string" || !model.trim())) {
      throw new Error(`Invalid pstack role: ${role}`);
    }
  }
  return config;
}

function modelName(model) {
  return `${model.provider}/${model.id}`;
}

function resolveModel(name, ctx) {
  if (!name || name === "auto" || name === "inherit-parent") {
    if (!ctx.model) {
      throw new Error("Select a parent model before running pstack workers.");
    }
    return modelName(ctx.model);
  }
  if (!ctx.modelRegistry.getAvailable().some((model) => modelName(model) === name)) {
    throw new Error(`Unavailable model: ${name}. Run /setup-pstack to see provider/model IDs.`);
  }
  return name;
}

function agentPrompt(agent) {
  if (agent === "poteto-agent") {
    return skillPrompt("poteto-mode");
  }
  if (agent === "comment-sicko") {
    return `${ADAPTER}\n${readFileSync(join(ROOT, "vendor/pstack/agents/comment-sicko.md"), "utf8")}\nReview only. Return findings without editing files.`;
  }
  return ADAPTER;
}

// Keep independent workers bounded while preserving the caller's result order.
async function runTasks(tasks, signal, worker) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      signal?.throwIfAborted();
      results[index] = await worker(tasks[index], signal);
    }
  }));
  return results;
}

function sumUsage(results) {
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  for (const result of results) {
    for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]) {
      usage[key] += result.usage?.[key] ?? 0;
    }
    for (const key of Object.keys(usage.cost)) {
      usage.cost[key] += result.usage?.cost?.[key] ?? 0;
    }
  }
  return usage;
}

export default function register(pi, schema, dependencies = {}) {
  const readConfig = dependencies.loadConfig ?? loadConfig;
  const worker = dependencies.runWorker ?? runWorker;
  let isEnabled = false;

  // Mode state belongs to the current branch, including reloads and tree navigation.
  function restoreMode(_event, ctx) {
    isEnabled = false;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === STATE) {
        isEnabled = entry.data?.isEnabled === true;
      }
    }
    ctx.ui.setStatus("pstack", isEnabled ? "poteto-mode" : undefined);
  }
  pi.on("session_start", restoreMode);
  pi.on("session_tree", restoreMode);
  pi.on("before_agent_start", async (event, ctx) => {
    if (!isEnabled) {
      return;
    }
    const config = await readConfig(ctx.cwd);
    return { systemPrompt: `${event.systemPrompt}\n\n${skillPrompt("poteto-mode")}\n\nPi pstack model configuration: ${JSON.stringify(config)}` };
  });

  pi.registerCommand("poteto-mode", {
    description: "Enable persistent pstack rigor. Use /poteto-mode off to disable.",
    handler: async (args, ctx) => {
      isEnabled = args.trim() !== "off";
      pi.appendEntry(STATE, { isEnabled });
      ctx.ui.setStatus("pstack", isEnabled ? "poteto-mode" : undefined);
      ctx.ui.notify(`poteto-mode ${isEnabled ? "on" : "off"}`, "info");
      if (isEnabled && args.trim() && args.trim() !== "on") {
        pi.sendUserMessage(args, { deliverAs: "followUp" });
      }
    },
  });

  // Prefix commands so other installed packages can retain their own short names.
  for (const name of NAMES) {
    if (name === "setup-pstack" || name === "poteto-mode") {
      continue;
    }
    pi.registerCommand(`pstack-${name}`, {
      description: `Run pstack's ${name} workflow`,
      handler: async (args, ctx) => {
        const config = await readConfig(ctx.cwd);
        pi.sendUserMessage(`${skillPrompt(name)}\n\nPi pstack model configuration: ${JSON.stringify(config)}\n\nUser request: ${args}`, { deliverAs: "followUp" });
      },
    });
  }

  pi.registerCommand("setup-pstack", {
    description: "Configure roles with provider/model IDs. Syntax: role=model,model or thinking=high",
    handler: async (args, ctx) => {
      const config = await readConfig(ctx.cwd);
      let choice = args.trim();
      if (!choice && ctx.hasUI) {
        const role = await ctx.ui.select("Configure pstack", [...ROLES, "thinking"]);
        if (!role) {
          return;
        }
        const model = await ctx.ui.select(role, role === "thinking" ? THINKING : ["inherit-parent", ...ctx.modelRegistry.getAvailable().map(modelName)]);
        if (!model) {
          return;
        }
        choice = `${role}=${model}`;
      }
      if (!choice) {
        pi.sendMessage({ customType: "pstack-config", content: JSON.stringify({ config, models: ctx.modelRegistry.getAvailable().map(modelName), roles: ROLES }, null, 2), display: true });
        return;
      }
      const separator = choice.indexOf("=");
      const role = choice.slice(0, separator).trim();
      const value = choice.slice(separator + 1).trim();
      if (separator < 1 || (role !== "thinking" && !ROLES.includes(role))) {
        throw new Error("Use /setup-pstack role=provider/model,provider/model or thinking=high");
      }
      if (role === "thinking") {
        if (!THINKING.includes(value)) {
          throw new Error(`Thinking must be one of: ${THINKING.join(", ")}`);
        }
        config.thinking = value;
      } else {
        const models = value.split(",").map((name) => name.trim());
        if (models.length > MAX_TASKS || models.some((name) => !name)) {
          throw new Error(`Choose between 1 and ${MAX_TASKS} models.`);
        }
        for (const name of models) {
          resolveModel(name, ctx);
        }
        config.roles[role] = models;
      }
      const path = configPath(ctx.cwd);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
      pi.sendMessage({ customType: "pstack-config", content: `Saved ${path}\n${JSON.stringify(config, null, 2)}`, display: true });
    },
  });

  // Child workers retain provider extensions but cannot recursively call this tool.
  if (process.env.PI_PSTACK_CHILD === "1") {
    return;
  }
  pi.registerTool({
    name: "pstack_run",
    label: "Pstack workers",
    description: "Run independent Pi workers in parallel. Each task may name a pstack role, an explicit provider/model, an agent, and cwd. A configured role panel runs one worker per model. Workers have separate contexts and share files in cwd. Assign separate worktrees for competing edits. Returns final outputs, usage, and transcript paths. Pass all independent tasks in one call. Up to 8 workers, 4 concurrently. Workers cannot delegate through pstack_run.",
    parameters: schema,
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const config = await readConfig(ctx.cwd);
      const tasks = params.tasks.flatMap((task) => {
        if (task.role && !ROLES.includes(task.role)) {
          throw new Error(`Unknown pstack role: ${task.role}`);
        }
        return (task.model ? [task.model] : config.roles[task.role] ?? ["inherit-parent"]).map((model) => ({
          task: task.task, model: resolveModel(model, ctx), thinking: config.thinking,
          cwd: resolve(ctx.cwd, task.cwd ?? "."), systemPrompt: agentPrompt(task.agent),
        }));
      });
      if (tasks.length < 1 || tasks.length > MAX_TASKS) {
        throw new Error(`Choose between 1 and ${MAX_TASKS} workers after panel expansion.`);
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
      }
      try {
        const results = await runTasks(tasks, controller.signal, worker);
        const content = results.map((result, index) => `Worker ${index + 1} (${tasks[index].model}), exit ${result.exitCode}\n${result.output}\nTranscript: ${result.transcript ?? "none"}`).join("\n\n");
        if (results.some((result) => result.exitCode !== 0)) {
          throw new Error(content);
        }
        return { content: [{ type: "text", text: content }], details: { results }, usage: sumUsage(results) };
      } finally {
        controller.abort();
        signal?.removeEventListener("abort", abort);
      }
    },
  });
}
