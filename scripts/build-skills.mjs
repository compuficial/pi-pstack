import { mkdir, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const names = (await readdir(join(root, "vendor/pstack/skills"))).sort();

// Thin wrappers preserve upstream sources and load Pi mappings before the workflow.
for (const name of names) {
  const directory = join(root, "skills", `pstack-${name}`);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), `---
name: pstack-${name}
description: "Run pstack's ${name} workflow or consult its ${name} rules."
disable-model-invocation: true
---

` + 'Read `../../docs/pi-runtime.md` first, then read `../../vendor/pstack/skills/' + name + '/SKILL.md` in full. Apply the Pi runtime mappings to that workflow and its dependencies. Resolve relative references from the upstream skill directory.\n');
}
