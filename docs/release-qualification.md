# Beta qualification

Release: `0.1.0-beta.6`. Tests performed 2026-11-07/09 on macOS 26.6.2. The controller identifies as `FootCtrlPlus_016`; the firmware version is unknown (the identity suffix is not treated as a verified firmware version).

| Capability | Evidence and boundary |
| --- | --- |
| PT-BR/EN editor | Browser UI exercised in both locales; generic destination, named preset, PC17 Bank A and CC69=127 Bank B created. |
| JSON import/export | Export inspected; reimport reviewed; prior draft automatically backed up; malformed version and >1 MiB file rejected on the public site. |
| Local persistence | Reload recovered the saved project and locale. Separate local project and complete-device backups are explicit. |
| Responsive layout | Desktop and 390px viewport visually inspected; no horizontal overflow observed. |
| Device backup import | Original FCP imported locally: 23,646 bytes and matching SHA-256; marked as an unverified imported file. |
| Native configuration read/write/restore | Actual TypeScript library and layout, physical controller, CoreMIDI transport. [Channel experiment](../research/experiments/001-hardware-roundtrip.md) and [bank experiment](../research/experiments/002-bank-library-roundtrip.md). Full final read matched the original backup. |
| Browser hardware adapter | Simulated endpoint tests cover protocol flow, preview ownership, conflicts, unknown bytes, concurrency, failed verification and restoration. Physical Chrome Web MIDI read/write/readback/restore passed on the public origin; see the [browser experiment](../research/experiments/003-web-midi-roundtrip.md). |
| Footswitch output / power-cycle persistence | Unverified. Storage readback does not establish these behaviors. |
| Factory reset / firmware update | Unsupported. No guessed reset or flashing command. |

The baseline remains private. Its SHA-256 is `6d45d5b2655f363f892bda52bfd3ca56e5ae69188cba0bd29a110f5d13ed21b7`. A final independent read-only pass matched that original image exactly after the experiments. Proprietary executables/disassembly, personal configuration bytes, raw private traces and credentials are excluded from Git and runtime assets.

## Direct editor (beta.6)

The mandatory wizard and project workspace were replaced by a direct controller
editor. [Design rationale](../.interface-design/system.md) explains the scope and
placement of every main control; [the product proposal](product/ui-reset-proposal.md)
contains the research and flows. Language is directly accessible as Português /
English. File operations, controller-wide options and individual switch actions
have distinct locations. The thirteen mode families remain available.

427 tests, strict typecheck and the production build pass. New tests cover
permission-aware discovery, qualified pairing, save/review invalidation,
revision-safe autosave, memory-only recovery, inactive-mode edits, cached read
replay, gesture removal, and incomplete fields across selection/language changes.
Opening or selecting equipment cannot silently rewrite existing MIDI. Local
recovery is distinct from explicit, fully verified hardware saving.

Coordinator CUA checks exercised all thirteen modes at 320px without horizontal
control/document overflow, and inspected 390/830/1280px layouts. The 830px layout
keeps the action form next to the controller; phone layouts show the selected
summary rather than pushing the form below four full cards. PT/EN preserves an
incomplete preset field; a reload retains valid configuration and language.
This is technical and visual qualification, not an observed novice usability study.

Actual Chrome Web MIDI opened and read the connected controller automatically
with the existing permission. Channel 1→2→1 and PC→Advanced→PC were written through
the new save bar, each with complete readback. Mode changes required the concrete
impact review. An independent native final read matched all 23,646 original bytes
and the baseline hash above. See [experiment 007](../research/experiments/007-direct-editor-roundtrip.md).
Physical footpress output, receiving-equipment sound and power-cycle retention
were not newly tested.

The Docker image was built with fresh base pulls; size is 13,932,448 bytes
(+23,537 from beta.5). It runs as 101:101 with a read-only root and writable `/tmp`.
Production dependency audit found zero known vulnerabilities. Trivy and Docker
Scout remain unavailable, so no image scan is claimed. The main JavaScript asset
is 713.94 kB (214.99 kB gzip); Vite's bundle-size advisory remains open.

## Mode-aware setup (beta.5)

All thirteen observed CubeSuite modes are selectable after a read, with the read
mode retained by default. Editors expose the corresponding fixed sequences,
custom MIDI selectors, Advanced actions, keyboard shortcuts, independent Mix
assignments and external interface endpoints. Unknown modes remain explicit and
cannot be written until a supported mode is chosen. Explicit scalar intent is
not overridden by legacy group-count inference.

[Experiment 006](../research/experiments/006-operating-modes.md) qualifies all
thirteen mode values, twenty globals and actual compiled keyboard/Mix/interface
write plans through full native readback and restoration. The Chrome wizard
also passed PC-to-custom-keyboard plus Ctrl+A, full readback and UI restoration.
An independent final native read confirmed the original image byte for byte.

Browser checks exercised every mode screen, PT/EN, the single-action tap/hold
editor, pending/invalid shortcuts, Mix per-switch types, external interface,
project export/import and retained independent mode data. Screens at 320, 390,
830 and 1280px were inspected, including open project controls, long names and
errors; no horizontal document overflow was observed. Export key ordering no
longer creates false musical-review changes.

343 tests, strict typecheck and the production image build passed. The image
was rebuilt with fresh base pulls and ran healthy as UID/GID 101:101 with a
read-only root, writable `/tmp`, dropped capabilities and no new privileges.
Size: 13,908,911 bytes (+46,962 from beta.4). Health, homepage, JavaScript assets,
SPA fallback, missing-asset 404s, CSP and Web MIDI policy passed local HTTP checks.
Production dependency audit reported zero known vulnerabilities. Trivy and Docker
Scout were unavailable, so no image vulnerability scan is claimed. The main
JavaScript asset is 686.55 kB; Vite's bundle-size advisory remains open.

## Guided configuration (beta.4)

The connection wizard reads and preserves the complete original before edits. Equipment profiles supply bilingual musical actions and parameters; the generic editor supports tap/hold, with raw MIDI behind Advanced. JSON v2 preserves the selected profile/action alongside deterministic MIDI; v1 imports remain supported. Local editing, device verification and user-reported physical results are separate.

206 tests, strict typecheck and production build passed. Browser checks covered PT/EN, the M5 preset1/preset2 example, local save/export and 390px and 320px mobile viewports without horizontal overflow. The current main JS bundle is 642.47 kB (194.62 kB gzip); Vite reports its >500 kB advisory, retained as a performance follow-up.

The [guided hardware experiment](../research/experiments/005-guided-actions-roundtrip.md) passed actual Chrome write/full-reread/restore. The final independent read matched the original SHA-256 and mode0. Physical footpress output and the receiving equipment response remain unverified.

The local production image built with fresh base pulls and ran healthy as UID/GID101:101, read-only with only `/tmp` writable. Size 13,861,949 bytes (+88,412 from beta3); production dependency audit reported no known vulnerabilities. Neither Trivy nor Docker Scout was available locally, so no image vulnerability scan is claimed.

## Controller illustration (beta.3)

The controller now follows the [photographic layout reference](../research/experiments/004-controller-visual-reference.md). E=A+B and F=C+D describe simultaneous physical presses; these labels do not add programmable pair records. The single central display identifies the selected editor switch, not live device state.

Coordinator browser checks at 1440px, 390px and 320px confirmed a single horizontal controller row without horizontal overflow, with switch targets at least 44px wide. Checks exercised PT-BR/EN, click and keyboard selection, Bank A/B changes, PC42 and CC69=127, save and reload persistence. No MIDI permission or hardware write was used for this visual change; prior physical qualification remains scoped to experiment 003.

## Deployment

Public origin: <https://chocolate-studio.mmonteiro.dev>. Repository: `matheus3301/chocolate-studio` (public, MIT). Coolify uses its authenticated GitHub App, the root Dockerfile, port 8080 and `/health`.

The real application image was built with a fresh base pull and a frozen lockfile; it ran locally as UID/GID 101:101 with a read-only root filesystem, writable `/tmp`, no extra capabilities and a successful Docker health check. Homepage/assets, SPA fallback, asset 404s, cache headers, CSP and Web MIDI permissions policy were checked. Initial runtime image size: 13,765,827 bytes. Production dependency audit found no known vulnerabilities; no image scanner was installed locally.

Coolify completed the deployment, external HTTPS homepage and health requests returned 200, and the actual VPS container reported healthy with UID 101:101. The API's application status initially lagged behind this runtime evidence; no unrelated infrastructure was modified. Immutable deployment commits and CI runs are recorded in the GitHub release notes. A redeploy rolls back the site only; MIDI writes require separate backup restoration.
