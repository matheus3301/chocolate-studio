# Beta qualification

Release candidate: `0.1.0-beta.1`. Tests performed 2026-11-07/08 on macOS 26.6.2. The controller identifies as `FootCtrlPlus_016`; the firmware version is unknown (the identity suffix is not treated as a verified firmware version).

| Capability | Evidence and boundary |
| --- | --- |
| PT-BR/EN editor | Browser UI exercised in both locales; generic destination, named preset, PC17 Bank A and CC69=127 Bank B created. |
| JSON import/export | Export inspected; reimport reviewed; prior draft automatically backed up; malformed version and >1 MiB file rejected on the public site. |
| Local persistence | Reload recovered the saved project and locale. Separate local project and complete-device backups are explicit. |
| Responsive layout | Desktop and 390px viewport visually inspected; no horizontal overflow observed. |
| Device backup import | Original FCP imported locally: 23,646 bytes and matching SHA-256; marked as an unverified imported file. |
| Native configuration read/write/restore | Actual TypeScript library and layout, physical controller, CoreMIDI transport. [Channel experiment](../research/experiments/001-hardware-roundtrip.md) and [bank experiment](../research/experiments/002-bank-library-roundtrip.md). Full final read matched the original backup. |
| Browser hardware adapter | Simulated endpoint tests cover protocol flow, preview ownership, conflicts, unknown bytes, concurrency, failed verification and restoration. Physical Web MIDI roundtrip is still pending browser permission. |
| Footswitch output / power-cycle persistence | Unverified. Storage readback does not establish these behaviors. |
| Factory reset / firmware update | Unsupported. No guessed reset or flashing command. |

The baseline remains private. Its SHA-256 is `6d45d5b2655f363f892bda52bfd3ca56e5ae69188cba0bd29a110f5d13ed21b7`. A final independent read-only pass matched that original image exactly after the experiments. Proprietary executables/disassembly, personal configuration bytes, raw private traces and credentials are excluded from Git and runtime assets.

## Deployment

Public origin: <https://chocolate-studio.mmonteiro.dev>. Repository: `matheus3301/chocolate-studio` (private). Coolify uses its authenticated GitHub App, the root Dockerfile, port 8080 and `/health`.

The real application image was built with a fresh base pull and a frozen lockfile; it ran locally as UID/GID 101:101 with a read-only root filesystem, writable `/tmp`, no extra capabilities and a successful Docker health check. Homepage/assets, SPA fallback, asset 404s, cache headers, CSP and Web MIDI permissions policy were checked. Initial runtime image size: 13,765,827 bytes. Production dependency audit found no known vulnerabilities; no image scanner was installed locally.

Coolify completed the deployment, external HTTPS homepage and health requests returned 200, and the actual VPS container reported healthy with UID 101:101. The API's application status initially lagged behind this runtime evidence; no unrelated infrastructure was modified. Immutable deployment commits and CI runs are recorded in the GitHub release notes. A redeploy rolls back the site only; MIDI writes require separate backup restoration.
