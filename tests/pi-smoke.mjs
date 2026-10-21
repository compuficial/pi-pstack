import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

const host = process.argv[2];
assert.ok(host, "Pass the installed pi-coding-agent package directory.");
const { loadExtensions } = await import(pathToFileURL(resolve(host, "dist/core/extensions/loader.js")));
const { loadSkillsFromDir } = await import(pathToFileURL(resolve(host, "dist/core/skills.js")));

// Use the installed host's module mapping and validators, including real TypeBox schemas.
const loaded = await loadExtensions([resolve("extensions/pstack.js")], process.cwd());
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
const extension = loaded.extensions[0];
assert.ok(extension.tools.has("pstack_run"));
assert.ok(extension.commands.has("poteto-mode"));
assert.ok(extension.commands.has("setup-pstack"));
const skills = loadSkillsFromDir({ dir: resolve("skills"), source: "pstack-smoke" });
assert.deepEqual(skills.diagnostics, []);
assert.equal(skills.skills.length, readdirSync("vendor/pstack/skills").length);
assert.ok(skills.skills.every((skill) => skill.name.startsWith("pstack-")));
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
assert.deepEqual(manifest.pi.extensions, ["./extensions/pstack.js"]);
console.log(`Pi loaded ${extension.commands.size} commands, ${extension.tools.size} tool, and ${skills.skills.length} skills without diagnostics.`);
