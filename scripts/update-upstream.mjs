import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const upstream = process.argv[2];
if (!upstream) {
  throw new Error("Run from the adapter root: node scripts/update-upstream.mjs <upstream-checkout>");
}
const root = process.cwd();
const source = resolve(upstream);
const provenance = JSON.parse(await readFile("UPSTREAM.json", "utf8"));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

// Never overwrite pending work in the paths this command owns.
if (git(root, "status", "--porcelain", "--", "vendor/pstack", "skills", "UPSTREAM.json", "README.md")) {
  throw new Error("Commit or stash local upstream, wrapper, provenance, and README edits before syncing.");
}

// Compare only pstack, so changes to other Cursor plugins never open a PR.
const commit = git(source, "rev-parse", "HEAD");
if (git(source, "rev-parse", `${commit}:pstack`) === git(root, "rev-parse", "HEAD:vendor/pstack")) {
  console.log("Vendored pstack is already current.");
  process.exit(0);
}

// Extract only committed upstream content; never execute its scripts during sync.
const directory = await mkdtemp(join(tmpdir(), "pstack-sync-"));
try {
  const archive = join(directory, "upstream.tar");
  execFileSync("git", ["archive", "--output", archive, commit, "pstack"], { cwd: source });
  execFileSync("tar", ["-xf", archive, "-C", directory]);
  const snapshot = join(directory, "pstack");
  const vendor = join(root, "vendor/pstack");
  const previous = await readdir(join(vendor, "skills"));
  const names = await readdir(join(snapshot, "skills"));
  await rm(vendor, { recursive: true });
  await cp(snapshot, vendor, { recursive: true, verbatimSymlinks: true });

  // Remove only wrappers owned by skills that disappeared upstream.
  for (const name of previous) {
    if (!names.includes(name)) {
      await rm(join(root, "skills", `pstack-${name}`), { recursive: true, force: true });
    }
  }
  execFileSync(process.execPath, [join(root, "scripts/build-skills.mjs")], { cwd: root });
  const readme = await readFile("README.md", "utf8");
  await writeFile("README.md", readme.replace(/\*\*\d+ bundled skills:/, `**${names.length} bundled skills:`));
  provenance.commit = commit;
  provenance.retrieved = new Date().toISOString().slice(0, 10);
  await writeFile("UPSTREAM.json", `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`Updated pstack to ${commit} (${names.length} skills).`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
