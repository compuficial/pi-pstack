import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts/update-upstream.mjs");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function put(root, path, text) {
  const file = join(root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

// Real repositories exercise the updater's CLI without network access or mocks.
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "pstack-upstream-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const upstream = join(directory, "upstream");
  const adapter = join(directory, "adapter");
  for (const repo of [upstream, adapter]) {
    await mkdir(repo);
    git(repo, "init", "-b", "main");
    git(repo, "config", "user.name", "Test");
    git(repo, "config", "user.email", "test@example.com");
  }
  await put(upstream, "pstack/skills/keep/SKILL.md", "Original skill\n");
  await put(upstream, "pstack/skills/obsolete/SKILL.md", "Removed later\n");
  await put(upstream, "pstack/.hidden", "preserve me\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Initial upstream");
  await cp(join(upstream, "pstack"), join(adapter, "vendor/pstack"), { recursive: true });
  await put(adapter, "UPSTREAM.json", JSON.stringify({
    repository: "https://github.com/cursor/plugins", directory: "pstack",
    commit: git(upstream, "rev-parse", "HEAD"), retrieved: "2026-01-01", license: "MIT",
  }, null, 2) + "\n");
  await put(adapter, "README.md", "# Pi pstack\n\n- **2 bundled skills:** workflows.\n");
  await mkdir(join(adapter, "scripts"));
  await cp(join(root, "scripts/build-skills.mjs"), join(adapter, "scripts/build-skills.mjs"));
  execFileSync(process.execPath, ["scripts/build-skills.mjs"], { cwd: adapter });
  git(adapter, "add", ".");
  git(adapter, "commit", "-m", "Initial adapter");
  return { upstream, adapter, run: () => execFileSync(process.execPath, [script, upstream], { cwd: adapter, encoding: "utf8", stdio: "pipe" }) };
}

test("updater copies committed source, refreshes wrappers and provenance, and removes obsolete skills", async (t) => {
  const { upstream, adapter, run } = await fixture(t);
  await rm(join(upstream, "pstack/skills/obsolete"), { recursive: true });
  await put(upstream, "pstack/skills/keep/SKILL.md", "Updated skill\n");
  await put(upstream, "pstack/skills/new/SKILL.md", "New skill\n");
  await put(upstream, "pstack/skills/another/SKILL.md", "Another skill\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Update skills");
  await put(upstream, "pstack/.hidden", "Uncommitted content must not be copied\n");

  run();

  assert.equal(await readFile(join(adapter, "vendor/pstack/.hidden"), "utf8"), "preserve me\n");
  assert.equal(await readFile(join(adapter, "vendor/pstack/skills/keep/SKILL.md"), "utf8"), "Updated skill\n");
  assert.match(await readFile(join(adapter, "skills/pstack-new/SKILL.md"), "utf8"), /vendor\/pstack\/skills\/new\/SKILL.md/);
  await assert.rejects(readFile(join(adapter, "skills/pstack-obsolete/SKILL.md")), { code: "ENOENT" });
  const provenance = JSON.parse(await readFile(join(adapter, "UPSTREAM.json"), "utf8"));
  assert.equal(provenance.commit, git(upstream, "rev-parse", "HEAD"));
  assert.match(provenance.retrieved, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(provenance.license, "MIT");
  assert.match(await readFile(join(adapter, "README.md"), "utf8"), /\*\*3 bundled skills:/);
  git(adapter, "add", ".");
  assert.equal(git(adapter, "write-tree", "--prefix=vendor/pstack/"), git(upstream, "rev-parse", "HEAD:pstack"));
});

test("updater leaves provenance and files unchanged for unrelated upstream commits", async (t) => {
  const { upstream, adapter, run } = await fixture(t);
  await put(upstream, "another-plugin/README.md", "Unrelated change\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Update another plugin");

  assert.match(run(), /already current/);
  assert.equal(git(adapter, "status", "--porcelain"), "");
  assert.match(run(), /already current/);
  assert.equal(git(adapter, "status", "--porcelain"), "");
});

test("updater refuses to overwrite local edits", async (t) => {
  const { upstream, adapter, run } = await fixture(t);
  await put(upstream, "pstack/skills/keep/SKILL.md", "Changed upstream\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Change upstream");
  await put(adapter, "vendor/pstack/skills/keep/SKILL.md", "Local work\n");
  assert.throws(run, /Commit or stash/);
  assert.equal(await readFile(join(adapter, "vendor/pstack/skills/keep/SKILL.md"), "utf8"), "Local work\n");
});
