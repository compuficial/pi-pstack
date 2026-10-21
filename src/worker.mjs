import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { finished } from "node:stream/promises";

const SKILLS = fileURLToPath(new URL("../skills", import.meta.url));
const OUTPUT_LIMIT = 24_000;

export async function runWorker(task, signal, invocation = { command: "pi", args: [] }) {
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "pi-pstack-"));
  const prompt = join(directory, "system.md");
  const transcript = join(directory, "session.jsonl");
  await writeFile(prompt, task.systemPrompt, { mode: 0o600 });
  const separator = task.model.indexOf("/");
  const args = [...invocation.args, "--mode", "json", "--print", "--no-session", "--provider", task.model.slice(0, separator), "--model", task.model.slice(separator + 1), "--skill", SKILLS, "--append-system-prompt", prompt];
  if (task.thinking) {
    args.push("--thinking", task.thinking);
  }

  // Send task text through stdin so shell syntax and leading dashes remain literal.
  const child = spawn(invocation.command, args, {
    cwd: task.cwd, env: { ...process.env, PI_PSTACK_CHILD: "1" },
    stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32",
  });
  const log = createWriteStream(transcript, { mode: 0o600 });
  child.stdout.pipe(log);
  const lines = createInterface({ input: child.stdout });
  let output = "";
  let stderr = "";
  let failure;
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  lines.on("line", (line) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event.type !== "message_end" || event.message?.role !== "assistant") {
      return;
    }
    const message = event.message;
    output = (message.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      failure = message.errorMessage ?? message.stopReason;
    }
    for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]) {
      usage[key] += message.usage?.[key] ?? 0;
    }
    for (const key of Object.keys(usage.cost)) {
      usage.cost[key] += message.usage?.cost?.[key] ?? 0;
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-OUTPUT_LIMIT);
  });
  child.stdin.on("error", () => {});
  child.stdin.end(task.task);

  // Terminate the process group so cancellation also stops tools started by the child.
  function killChild(signalName) {
    if (!child.pid) {
      return;
    }
    try {
      if (process.platform === "win32") {
        child.kill(signalName);
        return;
      }
      process.kill(-child.pid, signalName);
    } catch (error) {
      if (error.code !== "ESRCH") {
        throw error;
      }
    }
  }
  let killTimer;
  const abort = () => {
    killChild("SIGTERM");
    killTimer = setTimeout(() => killChild("SIGKILL"), 2000);
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) {
    abort();
  }
  try {
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
    await finished(log);
    if (signal?.aborted) {
      throw new Error(`Worker aborted. Transcript: ${transcript}`);
    }
    if (!output.trim() && !failure) {
      failure = stderr || "Pi returned no final assistant output.";
    }
    return { directory, prompt, transcript, model: task.model, output: (failure ?? output).slice(0, OUTPUT_LIMIT), exitCode: failure ? 1 : exitCode, usage, stderr };
  } finally {
    clearTimeout(killTimer);
    signal?.removeEventListener("abort", abort);
    lines.close();
    log.destroy();
  }
}
