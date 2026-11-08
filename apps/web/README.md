# Chocolate Studio web

Client-only React/Vite editor, PT-BR and English. Beta `0.1.0-beta.1`; not a
deployment or hardware-verification claim. No account, analytics, backend, remote
fonts, or configuration uploads.

## Run

```sh
pnpm install --frozen-lockfile
pnpm --filter @chocolate-studio/web dev
pnpm --filter @chocolate-studio/web build
pnpm --filter @chocolate-studio/web preview
```

## Editing and local data

The actual `@chocolate-studio/midi` schema owns JSON validation and import/export.
Groups contain pedals A–D. Each pedal exposes Bank A (the first action's message
sequence), Bank B (`secondaryMessages`), and its behavior. Additional imported
gestures remain explicit and editable; the device adapter may reject them.
No controller capacity is inferred from generic editing limits.

Destinations have default channels for new messages and destination selection.
An explicit channel override remains editable. Changing a destination's default
does not rewrite existing messages. Presets are named PC/bank/channel references,
not audio patches. Assigning a preset asks before replacing the selected sequence.

Save drafts explicitly. Dexie/IndexedDB stores the draft, locale, local backups,
and exact private device backup bytes. Replacements first preserve unsaved current
edits in an atomic backup+draft transaction. Concurrent tabs cannot silently
overwrite a newer saved revision. Clearing browser data removes these copies;
export JSON/FCP files for independent safekeeping. Storage failures are visible
and JSON export remains available.

JSON import/backup restore opens a full paginated field diff. Local restoration
changes only the draft. FCP import is separate, requires exactly 23646 bytes, and
never creates observed/verified state. Imported files have unknown device identity;
the real adapter must validate the full layout/hash and qualified connected target
before an explicitly confirmed restore. Device writes show musical differences;
hex offsets and hashes are optional MIDI details.

## Hardware integration

`App` accepts `hardware?: HardwareService`; see [HARDWARE-CONTRACT.md](HARDWARE-CONTRACT.md).
The default boundary is unavailable and every device operation rejects. The parent
owns `hardware-browser.ts`, `hardware-mapping.ts`, service injection in `main.tsx`,
and actual device/browser verification. The UI renders adapter reasons, history,
warnings and unsupported-field keys through i18next.

Read, draft and verified-write states are separate. Neither local saves, imports,
MIDI sends nor ACK alone claim verified device state. Complete raw backup restore
requires adapter validation, ACK and full reread; no factory reset/firmware action.
No firmware version is inferred from a device-name suffix.

## Validation boundary

The worker may run compilation, logic/storage checks and an HTTP asset smoke.
Visual, keyboard, mobile, Web MIDI permission/device, physical pedal and power-cycle
validation are coordinator-owned. There is no service worker/PWA: “runs in your
browser” does not promise an offline reload after the site is closed.

Worker verification on Node 22.22.3: frozen install and `pnpm check` passed
(134 tests, including 20 app regressions). Headless jsdom tests cover blocked name
edits, import cancellation/races, aggregate/UTF-8 byte limits, gesture selection,
confirmation actions, keyboard file controls, the connection shortcut and permission
guidance in both locales. Standalone strict checking of the app tests also passed.
A disposable real-module smoke confirmed saved semantic equality after parsing,
array-order significance and clean reopened drafts. No real browser, hardware,
container or deployment was exercised. Vite's main chunk warning remains visible.

Edits are validated with the MIDI package's export boundary before replacing the
draft. A rejected edit leaves the prior draft intact. Object key order does not
make a saved draft dirty; message/group order still matters. Older file reads
cannot reopen a cancelled or superseded review. The header connection shortcut
focuses the hardware panel without requesting or bypassing browser permission.
