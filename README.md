# Pi pstack

**pstack engineering workflows, adapted for Pi.**

[![CI](https://github.com/compuficial/pi-pstack/actions/workflows/ci.yml/badge.svg)](https://github.com/compuficial/pi-pstack/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Bring [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack) to the [Pi coding agent](https://pi.dev): investigate a codebase, compare designs, build test-first, and review changes with independent model workers.

This independent adaptation preserves the upstream source and adds a Pi-native runtime. It is not an official Cursor or Pi project, nor a complete replica of Cursor's execution environment.

## Features

- **58 bundled skills:** upstream workflows and engineering principles, available through namespaced commands.
- **Persistent Poteto Mode:** keep pstack instructions active across turns, reloads, and session resumption, following the active session branch.
- **Parallel workers:** run independent local Pi processes with role-based model panels, cancellation, token usage, and saved transcripts.
- **Project-level model configuration:** choose available Pi models per role without editing upstream instructions.

## Requirements

- **Pi 1.3.0**, the current release at the time of verification. Older versions are not supported by this package's declared compatibility range.
- **Node.js 22.19 or newer** and Git.
- A model provider configured in Pi. Worker processes need the `pi` executable on `PATH` and credentials available through normal Pi startup.

New to Pi? Follow the [Pi installation guide](https://github.com/earendil-works/pi#getting-started), configure a provider, then install this package. Check your versions with `pi --version` and `node --version`.

## Install

Install the published npm package:

```sh
pi install npm:@compuficial/pi-pstack
```

Or track the latest upstream commits directly from GitHub:

```sh
pi install git:github.com/compuficial/pi-pstack
```

Choose one source; installing both loads duplicate commands. Start Pi, or run `/reload` in an existing session. For a project-only installation, add `--local` to the install command.

Review the package before installing or trusting project-local resources. Extensions run with your account's permissions; workers can read files, edit code, and execute commands.

### Update or remove

Update all installed packages, then run `/reload`:

```sh
pi update --extensions
```

Unpinned npm installations follow published releases; unpinned Git installations follow upstream commits. To update only this package, use `pi update` followed by the source you installed.

For reproducible installations, append `@<version>` to the npm source or `@<commit-sha>` to the Git source. A pinned installation stays on that version or commit; choose a new version or ref explicitly to upgrade it.

To remove an npm installation:

```sh
pi remove npm:@compuficial/pi-pstack
```

For a Git installation, use `pi remove git:github.com/compuficial/pi-pstack` instead. Add `--local` when removing a project-only installation.

## Quick start

Enable pstack's engineering workflow for a task:

```text
/poteto-mode investigate and fix the failing checkout tests
```

Mode remains active until you disable it:

```text
/poteto-mode off
```

Or run a specific workflow without enabling persistent mode:

| Command | Purpose |
| --- | --- |
| `/pstack-how <question>` | Trace how a subsystem works |
| `/pstack-why <question>` | Investigate its design history |
| `/pstack-architect <task>` | Compare designs before implementation |
| `/pstack-arena <task>` | Compare independent candidates |
| `/pstack-swarm <task>` | Partition work across workers |
| `/pstack-interrogate <scope>` | Review through independent models |
| `/pstack-tdd <task>` | Write a failing test, implement, and verify |
| `/pstack-ketchup` | Summarize recent work |
| `/pstack-recall <topic>` | Reconstruct context from Pi sessions |

Use Pi's command completion to explore the bundled workflows. Each skill also has `/skill:pstack-<name>`. These wrappers are explicit-only, not automatically selected by the model. Invoking `/skill:pstack-poteto-mode` applies the instructions to one request; only `/poteto-mode` controls persistent mode.

## Configure models

Run `/setup-pstack` to choose a role and an available model. Without a UI, it displays configuration, available models, and role names.

No configuration is required: unconfigured roles use one worker on the parent model, with worker thinking set to `high`. To assign the current model explicitly or change thinking:

```text
/setup-pstack swarm workers=inherit-parent
/setup-pstack thinking=high
```

To compare models, copy exact `provider/model` IDs from setup and use this syntax (the IDs below are placeholders):

```text
/setup-pstack arena runners=<provider-a>/<model-a>,<provider-b>/<model-b>
```

Each configured entry creates one worker for that role. Settings are saved to `.pi/pstack.json` in the working directory and apply immediately. Invalid model selections leave the file unchanged.

## Worker behavior and limits

The agent uses `pstack_run` to dispatch independent tasks. Each task may select a role, model, agent, and working directory.

| Behavior | Limit or guarantee |
| --- | --- |
| Dispatch | Up to 8 workers per call after model-panel expansion; 4 run concurrently |
| Execution | Local Pi processes; the tool waits for completion |
| Context | Separate worker contexts; files are shared when working directories match |
| Cancellation | Cancelling the tool stops its workers |
| Results | Final text, token usage, and transcript paths return to the parent |
| Artifacts | Prompts and transcripts remain in `pi-pstack-*` directories under the OS temporary directory |
| Delegation | Workers cannot recursively call `pstack_run` |

**Use separate Git worktrees for competing edits.** The tool does not create isolation automatically. Parallel workers make separate model requests and can increase API costs. Saved prompts and transcripts may contain private code or model output; review them before sharing and remove them when no longer needed.

Credentials and providers configured only in parent-process memory are not forwarded. Cursor cloud execution, background Task handles, durable worker resumption, `/loop`, and Benny automation activation are not implemented. Some upstream scripts and integrations require additional tools or services, such as Bun or `gh`.

See the [Pi runtime mappings](docs/pi-runtime.md) for the full adaptation contract.

## Upstream updates

A weekly workflow opens or refreshes a draft PR when upstream pstack changes, including the full source diff and updated Pi wrappers. Updates require review and are never merged automatically. Maintainers can also [run the check on demand](https://github.com/compuficial/pi-pstack/actions/workflows/upstream.yml). See [the maintenance guide](CONTRIBUTING.md#updating-upstream) for details.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, tests, package verification, and upstream updates. The adapter tests do not make model API calls.

## Attribution and license

[pstack](https://github.com/cursor/plugins/tree/main/pstack) is created by **Lauren Tan** and distributed under the MIT license. Its source is preserved in [`vendor/pstack`](vendor/pstack), including the [original license](vendor/pstack/LICENSE). [`UPSTREAM.json`](UPSTREAM.json) records the exact vendored commit.

The Pi adapter is maintained by [compuficial](https://github.com/compuficial) and is also [MIT licensed](LICENSE). Upstream content is preserved verbatim; Pi-specific behavior lives outside the vendor directory.
