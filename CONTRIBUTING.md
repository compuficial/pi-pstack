# Contributing

Keep the adapter small, preserve upstream sources, and verify behavior against the supported Pi host.

## Local setup

Install Node.js 22.19 or newer, Git, and [Pi 1.3.0](https://github.com/earendil-works/pi#getting-started). Then clone this repository:

```sh
git clone https://github.com/compuficial/pi-pstack.git
cd pi-pstack
```

The adapter has no runtime dependencies beyond packages supplied by Pi. No `npm install` is needed to run its unit tests or load it through an installed Pi host.

Try the local package for one invocation:

```sh
pi -e .
```

Avoid loading both a local checkout and an installed copy of this package in the same session; their command names will collide.

## Verification

Run the adapter's unit and subprocess tests:

```sh
npm test
```

Verify command, tool, and skill loading against the installed Pi host:

```sh
node tests/pi-smoke.mjs "$(npm root -g)/@earendil-works/pi-coding-agent"
```

The argument is the **Pi host package directory**, not this repository. If Pi was installed outside npm's global directory, pass its actual package location instead.

Check the distributable file list:

```sh
npm pack --dry-run
```

These checks do not call model APIs. CI runs tests and host-loading checks on Node.js 22 and 24 with Pi 1.3.0. Actual model calls require a configured provider and may incur costs.

## Publishing to npm

The npm package is `@compuficial/pi-pstack`. Publishing requires an npm account with access to the `@compuficial` scope. `publishConfig.access` makes the scoped package public; the `pi-package` keyword makes it eligible for discovery in the [Pi package catalog](https://pi.dev/packages).

For the first release, keep version `0.1.0`. For subsequent releases, update `package.json` to a new version; npm does not allow reusing a published version.

Run all verification checks above. Review `npm pack --dry-run` for required runtime files, skill wrappers, upstream sources, both licenses, and accidental private files. No build step is required.

When ready, authenticate with `npm login`, then publish from the repository root:

```sh
npm publish
```

Verify the published version with `npm view @compuficial/pi-pstack version`, then test `pi install npm:@compuficial/pi-pstack` in an environment without another copy loaded. Catalog discovery may not be immediate. Git installations continue to track commits independently of npm releases.

## Repository layout

| Path | Purpose |
| --- | --- |
| `extensions/pstack.js` | Pi entry point and tool schema |
| `src/` | Commands, persistent mode, configuration, and worker runtime |
| `skills/` | Generated, explicit-only Pi skill wrappers |
| `docs/pi-runtime.md` | Mapping from Cursor concepts to Pi behavior |
| `vendor/pstack/` | Unmodified upstream source and license |
| `UPSTREAM.json` | Upstream repository, pinned commit, and retrieval date |
| `scripts/build-skills.mjs` | Wrapper generator |
| `scripts/update-upstream.mjs` | Committed-source sync and obsolete-wrapper cleanup |
| `tests/` | Adapter tests and Pi host smoke check |

## Updating upstream

### Automatic review PRs

[Update upstream pstack](https://github.com/compuficial/pi-pstack/actions/workflows/upstream.yml) runs every Monday at 06:17 UTC, subject to GitHub scheduling delays. Maintainers can also run it through **Actions → Update upstream pstack → Run workflow**.

It compares the upstream `pstack/` Git tree with our vendored tree. Unrelated Cursor plugin commits do nothing. When content changes, it opens or refreshes one draft PR on `automation/update-pstack`, including the complete vendor diff, regenerated wrappers, obsolete-wrapper removal, README skill count, and updated `UPSTREAM.json`.

The branch is bot-owned and may be rewritten when the PR refreshes. Do not put manual work on it. The bot never merges or changes the Pi runtime mappings. Review changed upstream instructions for compatibility, then mark the draft **Ready for review** to trigger CI. The built-in `GITHUB_TOKEN` does not trigger normal PR workflows when it creates or updates a PR. Updates return the PR to draft status, so mark it ready again after reviewing a refreshed diff.

Repository **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** must be enabled. The updater alone requests content/PR write access; CI remains read-only. No personal access token is required. The workflow is disabled on forks by its repository guard.

### Manual sync

With a clean adapter checkout, fetch [cursor/plugins](https://github.com/cursor/plugins) into a separate checkout and select an exact commit. From the adapter root, run:

```sh
node scripts/update-upstream.mjs /path/to/cursor-plugins
```

This requires Git and `tar`. The script reads committed source at that checkout's `HEAD`, ignores its uncommitted edits, and refuses to overwrite pending edits in the adapter paths it owns. It does not execute upstream scripts. The standalone wrapper generator adds/updates wrappers only; use the updater for removal cleanup.

Review the diff and `docs/pi-runtime.md` for changed runtime assumptions, run the verification checks above, and submit the update for review. Do not patch vendor files to adapt behavior for Pi.

## Changes and reports

For runtime fixes, include a test that fails before the fix and passes afterward. Keep generated wrappers in sync with their source, avoid unrelated refactors, and document intentional compatibility limits.

Open issues and pull requests at [compuficial/pi-pstack](https://github.com/compuficial/pi-pstack). Include Pi and Node.js versions, reproduction steps, and expected versus actual behavior. Remove credentials, private code, and sensitive transcript content before posting.
