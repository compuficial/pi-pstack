# Pi runtime for pstack

This file adapts the bundled Cursor instructions to Pi. Apply these runtime mappings whenever you read an upstream skill, playbook, reference, or agent. Keep the upstream engineering steps and verification criteria. Runtime mappings take precedence over Cursor-specific execution instructions. User instructions and repository rules take precedence over every skill.

## Skills and references

The original sources are in `vendor/pstack/skills/<name>/`. Resolve relative references, scripts, and playbooks from the upstream skill's base directory. The Pi skill names are `pstack-<name>`. Read the corresponding source when another skill is required. A source's `disable-model-invocation` controls automatic discovery, not a workflow's explicit dependency on that source.

Use `/pstack-<name> <request>` to run a workflow. `/poteto-mode <request>` enables persistent mode for this session branch. `/poteto-mode off` disables it. `/setup-pstack` configures the native runtime. Reading a skill through `/skill:pstack-poteto-mode` applies its instructions to that request; use the native command for persistence.

## Models and workers

The authoritative model configuration is `.pi/pstack.json` in the Pi working directory. The runtime attaches current configuration when running a command or persistent mode. Each role is a list of exact `provider/model` IDs. An absent role runs one worker on the parent model. `auto` and `inherit-parent` also mean the current parent model. `thinking` is a Pi reasoning level, separate from the model ID. Configure a panel with `/setup-pstack arena runners=provider/model,provider/model`. Select a distinct model for each seat when independent perspectives matter. Configure available models explicitly; upstream Cursor model slugs and family fallback instructions are historical and must be replaced with these Pi choices.

Use the native `pstack_run` tool for upstream Task calls and fan-out:

```json
{
  "tasks": [
    {"task": "Explore cancellation. Return traced call paths.", "role": "how explorer"},
    {"task": "Review the diff. Return evidence for each finding.", "role": "interrogate reviewers", "agent": "poteto-agent"}
  ]
}
```

Each configured panel expands into one worker per model. Explicit `model` selects one available `provider/model` instead. `agent` accepts `generalPurpose`, `poteto-agent`, or `comment-sicko`. Translate the upstream `Comment Sicko` name to `comment-sicko`. `cwd` selects a directory or worktree relative to the parent working directory. Workers have separate contexts, share the filesystem, and return final output and full transcript paths. Put independent tasks in one call, with at most eight expanded workers and four running at once. Give each worker a complete prompt with scope, input paths, and acceptance criteria. Assign separate worktrees or output paths for competing writes before dispatch.

Workers execute locally through the installed `pi` binary and retain configured extensions, authentication, and provider setup. Runtime-only providers registered by the parent and unsaved model credentials are not forwarded. Use a provider configured for normal Pi CLI startup. The parent reviews outputs and performs synthesis. Workers cannot recursively call `pstack_run`; flatten nested fan-out into parent-owned dispatches. Use separate calls for dependent phases. Each call waits for its workers. Cursor background handles, cloud environments, persistent Task IDs, and interrupt/resume directives map to fresh local workers with consolidated prompts. This port does not promise remote execution or durable worker resumption.

## Pi tools and session history

Map upstream Read, Write, Edit, and Shell to Pi's `read`, `write`, `edit`, and `bash` tools. If a specialized search, MCP, browser, or control tool exists, use its actual advertised API. Inspect the available tool list before using external integrations. Missing integrations require an explicit limitation or an available equivalent.

Map AskQuestion to a concise user question or an available interaction tool. Map TodoWrite to an available todo tool, or a Markdown checklist in the task notes when no todo tool exists. Update it as work completes. Map create-skill to authoring an Agent Skills directory containing `SKILL.md` and validating it with Pi's skill loader. Pi has no built-in Cursor plan mode, `/loop`, `/add-plugin`, or cloud-agent UI. For autonomous work, continue within the active turn until the stated acceptance criterion is met. Restarted work requires a saved handoff and a new invocation.

Pi transcripts are JSONL files under `${PI_CODING_AGENT_DIR:-~/.pi/agent}/sessions/`. Locate the current workspace's session directory from actual files rather than guessing its slug. Read `message` entries and their structured role/content fields, and match by file modification time. Search only the requested topic, exclude the current session and worker/test transcripts, and sanitize private content before public output. Cursor conversation and project paths in upstream instructions map to this Pi session store.

## External dependencies

The bundled helper scripts retain their upstream requirements, including Bun, git, gh, platform tools, or optional services. Read each script's usage and dependencies before execution. `deslop`, `control-cli`, and `control-ui` are external upstream skills, not bundled native Pi tools. Use installed equivalents or report the missing capability. The Benny Slack/webhook automation pack is preserved as source material and requires a separate integration; native commands do not activate it.
