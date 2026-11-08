# Changelog

## 0.1.0-beta.3 — 2026-11-08 UTC

- Replaced the four tall stompbox cards with a single horizontal Chocolate Plus controller illustration: A/B, central editor-selection display, C/D.
- Added physical pair markings and bilingual guidance for E=A+B and F=C+D pressed together. These labels do not add programmable E/F records.
- Moved assignment names and MIDI summaries below the chassis, with clearer selection and keyboard focus. The physical layout stays in one row on small screens.
- File format, protocol, hardware write scope and existing configurations remain unchanged.

## 0.1.0-beta.2 — 2026-11-08 UTC

- Public source repository under the MIT license; npm publishing remains disabled.
- Physical Web MIDI qualification completed through the public site in Chrome: complete backup, PC/CC A/B edit, seven-byte reviewed write, exact full readback, and restoration of the original configuration.
- Independent native read after browser disconnection confirmed all 23,646 original bytes. See [experiment 003](research/experiments/003-web-midi-roundtrip.md).
- No protocol or editor behavior changes in this release; physical gestures, power-cycle persistence and external effects routing remain unverified.

## 0.1.0-beta.1 — 2026-11-08 UTC

First public beta, entirely client-side, in Portuguese and English.

- Four-pedal editor with groups, PC/CC sequences, per-pedal Bank A/B, channel and bank selection, generic MIDI destinations, and named presets.
- Version-1 JSON import/export with validation, review, local draft persistence, snapshots, and an automatic backup before replacing a draft.
- Independent Chocolate Plus protocol and FCP layout libraries derived from our own CubeSuite analysis and controlled hardware experiments.
- Explicit Web MIDI port selection, device identity qualification, complete configuration backups, reviewed writes, conflict detection, exact readback verification, and backup restoration.
- Responsive interface, permission guidance, accessible controls, and bounded MIDI activity history.
- Static, non-root Docker deployment through Coolify with HTTPS and GitHub App integration.

### Qualification

The real TypeScript protocol/layout libraries passed native CoreMIDI read/write/readback/restore tests on `FootCtrlPlus_016`. The original configuration was restored exactly. Web UI editing, translations, import/export, presets, local persistence, FCP import, malformed/oversized file rejection and responsive layout were exercised in a browser.

The physical Web MIDI roundtrip is pending the browser permission step. This is distinct from the verified native hardware experiment and from simulated adapter tests. See [release qualification](docs/release-qualification.md) for the complete boundary.

### Compatibility and limits

- Project format: `formatVersion: 1`; unknown versions are rejected. No older migration is advertised.
- Hardware programming is enabled only for the observed `FootCtrlPlus_016` identity: advanced-mode PC/CC banks, up to 8 groups, 4 switches, 2 sequences per switch and 16 expanded messages per sequence. Destination names and presets are project metadata.
- Opaque data is preserved. A change requiring an unsupported interpretation is rejected rather than silently rewritten.
- Physical gesture output, power-cycle persistence, other firmware identities and routing to external effects units remain unverified.
- No firmware flashing, factory reset, arbitrary-controller programming, accounts, cloud synchronization or PWA installation.

Site rollback does not restore pedal settings. Device recovery uses the saved configuration backup.
