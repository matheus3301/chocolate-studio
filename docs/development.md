# Development and release policy

## Toolchain and local checks

Use Node **22.22.3** for the reproducible local/CI baseline. The root engine floor is
`>=22.22.0`; it is not a claim that every newer Node release has been exercised.
`package.json` pins pnpm **11.25.0**, TypeScript **7.0.2**, and Vitest **5.1.0**.
Install the pinned pnpm with your Node manager or `npm install --global pnpm@11.25.0`.
Do not use an unpinned `pnpm@latest` for project installs.

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:unit
pnpm build
# Same checks, stopping on the first failure:
pnpm check
```

`pnpm test` aliases the unit suite. Vitest discovers `*.test.*` and `*.spec.*`
using its standard defaults across the repository; no hard-coded package list or
placeholder tests are required. Core tests must be hardware-free, deterministic,
and based on independently observed, publishable fixtures with provenance.
Hardware experiments are coordinator-only and are not CI unit tests.

Typecheck and build discover manifests below `packages/` and `apps/` through pnpm
workspace filters and run their scripts in dependency order. They exclude the root
to avoid recursion. Empty app directories without manifests are scaffolds, not
build targets. No matching project is an error; if no selected project defines the
requested script, pnpm also fails. Individual packages without that script are
skipped by pnpm: every implemented TypeScript package must provide `typecheck`,
and every buildable package/app must provide `build`. Review these contracts when
adding a manifest; a documentation-only package need not invent a build.

Package typechecks should invoke `tsc --noEmit` with their project config extending
`tsconfig.base.json`. The shared base is strict, including unchecked-index and
exact-optional checks, and defaults to `noEmit`. A package that emits artifacts must
override `noEmit` in its build config or use its actual bundler; a successful
no-emit typecheck is not a frontend build. Protocol/core code must not import React,
UI translations, or application storage.

There is deliberately no fake lint command. Current quality gates are strict
compilation, meaningful unit tests, and actual package builds. Add a linter only
with real rules and an agreed scope.

### Scaffold and lockfile status

At tooling handoff, only the root has dependencies; packages/apps have no
manifests, frontend, or tests. `pnpm test:unit` must fail with no tests, and
`pnpm typecheck`/`pnpm build` must fail with no workspace targets. Do not add
`--passWithNoTests`, dummy tests, or no-op build scripts to make that state green.
CI becomes green only after real package implementations and tests are integrated.
The root `0.1.0` manifest version is a planned version, not a release declaration.

Commit `pnpm-lock.yaml` alongside dependency changes. `pnpm install` deliberately
updates it during development; CI uses `--frozen-lockfile` and must not repair it.
The coordinator must regenerate the merged lockfile with pnpm 11.25.0 after
package manifests merge, then repeat the frozen install and all checks. Keep pnpm's
dependency lifecycle-script protections; review any required build-script approval
rather than blanket-enabling dependency scripts. Never copy private hardware dumps,
user configuration, credentials, or orchestration logs into test assets.

### Compatibility evidence and references

Local registry metadata declares TypeScript 7.0.2 requires Node `>=16.20.0`,
Vitest 5.1.0 requires `^22.12.0 || ^24.0.0 || >=26.0.0`, and pnpm 11.25.0
requires `>=22.13`. Node 22.22.3 satisfies all three.

Tooling handoff verification on macOS arm64 / Node 22.22.3:

- Frozen root install and both compiler/test-runner version commands passed.
- A disposable workspace passed `pnpm check` and `pnpm test`: strict compilation,
  discovered boundary tests, dependency-ordered package/app emission, and execution
  of the emitted modules. An empty app scaffold was ignored.
- Injected assertion, TypeScript assignment, and build-process failures returned
  nonzero through the root commands. The real scaffold build rejected no targets.
- actionlint 1.7.12 accepted the workflow. No GitHub-hosted workflow, frontend,
  container, or hardware run was performed.

The disposable fixture was removed; no dummy product tests were added. Repeat
these checks after integration. This evidence does not establish browser or
hardware support.

Primary references for changes to this setup:

- [pnpm installation/compatibility](https://pnpm.io/installation#compatibility)
- [pnpm recursive execution](https://pnpm.io/cli/recursive),
  [run](https://pnpm.io/cli/run), [filtering](https://pnpm.io/filtering), and
  [frozen installs](https://pnpm.io/cli/install)
- [TypeScript 7.0.2 registry metadata](https://registry.npmjs.org/typescript/7.0.2)
- [Vitest 5.1.0 registry metadata](https://registry.npmjs.org/vitest/5.1.0)
- [pnpm 11.25.0 registry metadata](https://registry.npmjs.org/pnpm/11.25.0)

## GitHub quality workflow

`.github/workflows/quality.yml` runs on pull requests, branch pushes, and manual
dispatch using GitHub-hosted Ubuntu 24.04. It installs Node 22.22.3 and reads the
pnpm version from `packageManager`, then performs a frozen install, typecheck,
unit suite, and build. There is no tag-triggered publication or deployment.

Actions are pinned to full commit SHAs, with release comments for review:

- [actions/checkout v7.0.1](https://github.com/actions/checkout/tree/3d3c42e5aac5ba805825da76410c181273ba90b1)
- [actions/setup-node v7.1.0](https://github.com/actions/setup-node/tree/949feb2413d6458794dcd2491c4babbbce0c15c1)
- [pnpm/action-setup v6.1.1](https://github.com/pnpm/action-setup/tree/73e46992e05b19abd31f2f3c20e0e7370d762115)

The action runtime is separate from the project's selected Node version; current
GitHub-hosted runners satisfy the actions' Node 24 runtime requirements. Recheck
upstream release documentation and resolve each tag to its repository commit
(including annotated tags) before changing a pin. Updates require review; do not
switch to floating major tags. See GitHub's [secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).

Only `contents: read` is granted; checkout does not persist credentials. No write
permissions, OIDC, deployment secrets, registry auth, domains, or infrastructure
identifiers are needed. Do not use privileged `pull_request_target` to run PR code.
Caching is disabled to keep this initial workflow simple. CI validates source;
it neither publishes packages nor proves any hardware capability.

## Static deployment design — not implemented or released

The product is entirely client-side, in PT-BR and English, with generic MIDI
destinations/profiles. The static server is hosting infrastructure, not an
application backend. Do not add an API service, database service, or server-side
configuration/MIDI proxy.

The coordinator will assign the runtime build once a real frontend exists. The
Dockerfile design for that task is:

1. A Node 22.22.3 build stage installs pnpm 11.25.0, copies the workspace manifests
   and lockfile, runs a frozen install, then copies source and runs the actual
   frontend/dependency build. Pin reviewed build/runtime base images by digest.
2. Copy only the built public assets into a maintained, **nonroot** static-server
   runtime. Do not copy Node, node_modules, source fixtures, private research,
   `.git`, or environment files into the runtime image. Add a matching
   `.dockerignore` when implementing the Dockerfile.
3. Serve on an unprivileged port such as 8080 with a nonzero UID. Configure the
   actual server for SPA fallback only if the chosen frontend router requires it;
   missing asset requests must still fail, not return HTML. Use short/no-cache
   HTML and immutable caching only for content-hashed assets.
4. Include a local HTTP healthcheck and an explicit listening port. Test image
   startup, UID, asset loading, refresh/deep links, and stopped-container behavior.
   Record the exact image digest and source commit for rollback.
5. Deploy through the existing Coolify skill using the Dockerfile, with domain,
   TLS, and environment settings managed outside this repository/workflow. Web
   MIDI requires a secure browser context and explicit permission; HTTPS does not
   by itself prove device or SysEx support. Build-time public values are visible
   to users and cannot contain secrets.

No Dockerfile or fake frontend artifact is supplied at this scaffold stage. The
actual output path, runtime image/digest, health endpoint, and routing policy must
come from the implemented frontend. A passing library build does not authorize
publication. Deployment must be smoke-tested by the coordinator on the actual
static surface before claiming availability.

## First working release: v0.1.0

Releases are owned and executed manually by the coordinator. This policy does not
authorize workers or CI to tag, push, merge, publish, or deploy. The workspace root
remains private; no npm publication is planned.

Use SemVer tags `vMAJOR.MINOR.PATCH`, starting with `v0.1.0` for the first working
editor. Optional candidates use `v0.1.0-rc.1`, incrementing the numeric suffix.
Never move or reuse a released tag. During 0.x, incompatible changes increment the
minor version; compatible fixes increment patch. Release notes must explicitly
identify breaking file/profile changes and any migration or recovery limits.

### Honest capability matrix

Publish the matrix for each candidate with evidence links and limitations. The
following is the **scaffold baseline**, not tested product capability:

| Capability | Baseline status | Required evidence before a support claim |
| --- | --- | --- |
| PT-BR/EN generic profile editor | Not implemented | Real UI exercised in both locales, generic/custom destinations, draft changes and file workflow |
| File import/export | Unverified | Provenanced format fixtures; malformed/oversized input handling; opaque data preserved; round-trip and migration limits |
| Generic MIDI send | Unverified | Exact device/transport/browser permission and message observations; successful send is not readback verification |
| Chocolate Plus configuration read | Unsupported until observed | Own CubeSuite/device observations, response validation, device/firmware identification and read-state evidence |
| Chocolate Plus write + readback | Unsupported until observed | Reviewed diff, own command observations, reread comparison; separate draft/read/verified states |
| Persistence after power cycle | Unverified | Coordinator's repeatable power-cycle/reread experiment for the specific supported settings |
| Restore/recovery | Unsupported until demonstrated | Proven safe backup/restore procedure and successful reread; never infer factory reset |
| Firmware flashing / factory reset | Unsupported | Not part of v0.1.0; no guessed commands or recovery claims |
| Programming arbitrary MIDI controllers | Unsupported | Generic MIDI destinations do not imply arbitrary controller programming support |

For every hardware claim record device model, firmware (or explicitly unknown),
transport, OS, browser/version, operation/field scope, experiment identifier/date,
publishable fixture hash/provenance, expected/observed result, and recovery limits.
Use statuses **unsupported**, **unverified**, **observed**, and **verified**
precisely: observation of a response is not an end-to-end verification of writes or
persistence. Keep private baselines out of release assets; publish sanitized,
independently prepared evidence only. No OpenChocolate code/tables/offsets are
protocol evidence for this implementation.

v0.1.0 may ship a useful offline generic editor while hardware operations remain
disabled. Describe it as such; do not call it a CubeSuite replacement. Enabled
hardware writes require demonstrated readback and safe recovery for that scope.

### Release checklist and commands

- [ ] Coordinator integrates the actual frontend and packages, updates the merged
  lockfile, confirms version `0.1.0`, and chooses a reviewed, clean release commit.
- [ ] Frozen install, `pnpm check`, and the quality workflow pass on that commit.
  A local pass is not a substitute for observing the GitHub workflow result.
- [ ] Coordinator exercises the served frontend in PT-BR and EN, offline editing,
  import/export and invalid files, generic destinations, and browser permission/
  unavailable-device errors. Unsupported hardware controls remain disabled.
- [ ] Coordinator performs any advertised hardware scenarios with explicit scope:
  disconnect/timeout, read, write/readback, persistence, and demonstrated recovery.
  Update the capability matrix; do not infer results from unit tests or MIDI send.
- [ ] Prepare `CHANGELOG.md`/release notes using the template below, including
  limitations and links to evidence, not private captures or credentials.
- [ ] Build and smoke-test the real Dockerfile/static runtime, record source/image
  digests and rollback target, and verify no backend or secret enters the assets.
- [ ] Coordinator explicitly approves tagging/publication/deployment. These are
  separate actions; none are automated by the quality workflow.

Commands below are for the coordinator **after** those gates; they are not run by
this tooling task. Start from the reviewed release commit with a clean worktree:

```sh
pnpm install --frozen-lockfile
pnpm check
git rev-parse HEAD
git status --short
# After reviewing evidence, notes, and the exact source commit:
git tag -a v0.1.0 -m "Chocolate Studio v0.1.0"
git show v0.1.0 --no-patch
# Only when separately authorized to publish the tag:
git push origin refs/tags/v0.1.0
# Manual draft only; review capability claims before publishing the release:
gh release create v0.1.0 --verify-tag --draft --title "Chocolate Studio v0.1.0" --notes-file CHANGELOG.md
```

Coolify deployment remains a separate coordinator operation through its skill.
Rollback redeploys the previously verified immutable image; it does not undo any
hardware configuration writes. Never imply that site rollback restores a device.

### Changelog/release-note template

Copy into the release changelog and replace each bracketed field with evidence.
This is a template, not a declaration that v0.1.0 exists.

```markdown
## [0.1.0] - [YYYY-MM-DD]

Source: [full commit SHA]; tag: v0.1.0; static image: [digest or not deployed]

### Added
- [User-visible PT-BR/EN editing/file/MIDI features actually exercised]

### Fixed
- [User-visible fixes, or omit section]

### Compatibility and breaking changes
- [Supported file/profile versions and migration limits]
- [Browser/OS/transport combinations actually exercised]

### Hardware capability matrix
[Operation-by-operation status, device/firmware/scope, evidence links and limits]

### Known limitations and safety
- [Disabled/unverified operations, recovery limits, permission requirements]
- [No firmware flashing/factory reset; no arbitrary controller-programming claim]

### Verification and deployment
- [Exact quality workflow run, local command results, frontend smoke evidence]
- [Hardware experiment references, or explicitly no hardware verification]
- [Deployment status, immutable rollback target; no device rollback implied]
```
