# Chocolate Studio

A browser-based editor for MIDI controller configurations. Initial hardware target: M-VAVE Chocolate Plus.

The product runs entirely on the client, supports Portuguese and English, and uses generic MIDI destinations and presets. The Chocolate Plus library is independently developed from controlled observations of CubeSuite and hardware experiments.

## Workspace

- `packages/chocolate`: independently derived protocol, transport contracts and verified read/write sessions.
- `packages/chocolate-layout`: observed FCP fields, eight-group bank layout and immutable patches preserving opaque bytes.
- `packages/midi`: generic MIDI messages, destinations and configuration models.
- `research/tools`: native MIDI capture tooling; `apps/lab` reserves a separate research workbench.
- `apps/web`: public configuration editor.
- `research/experiments`: reproducible procedures and findings.
- `research/fixtures`: deliberately prepared test evidence, with provenance.

## Status

The public beta is available at [chocolate-studio.mmonteiro.dev](https://chocolate-studio.mmonteiro.dev). The actual TypeScript library has passed full configuration reads, channel and advanced-bank storage writes, exact readback and restoration on a Chocolate Plus identifying as `FootCtrlPlus_016`. The public site also passed a physical Chrome Web MIDI read/write/readback/restore cycle ([browser experiment](research/experiments/003-web-midi-roundtrip.md)). See [hardware evidence](research/experiments/002-bank-library-roundtrip.md), [layout mapping](packages/chocolate-layout/MAPPING.md), and [release qualification](docs/release-qualification.md).

The editor programs PC/CC sequences in advanced mode: up to eight groups, four switches per group and two banks of up to sixteen expanded MIDI messages per switch. Bank selection expands to CC0/CC32 before PC. Names, destination labels and preset libraries are local project metadata. Keyboard/custom opaque records are preserved rather than silently converted.

No firmware-update or factory-reset operation is implemented. Recovery uses an exact configuration backup. Physical footpress behavior and persistence across a power cycle still need separate validation; storage verification alone does not establish them. Other device identities are not enabled for hardware writes.

## Use

1. Open the site in a desktop browser supporting Web MIDI with SysEx. Allow the MIDI permission requested by **Connect pedal → Find MIDI ports**.
2. Explicitly select the controller's input and output, connect, and read the device. Save a complete device backup before editing.
3. Review the read configuration into your draft. Choose a group and pedal, then edit PC/CC messages, channels, Bank A/B and behavior. Generic destinations and named presets belong to the local project.
4. Save/export the project as versioned JSON. Review device changes separately, then apply; the adapter rereads the device and requires an exact byte match before reporting a verified write.

JSON imports replace the draft only after review and automatic local backup. FCP imports are complete device backups, clearly marked unverified until restored and reread; they are not editable project JSON. Browser data stays on this origin/device: export files to transfer or retain an independent copy. There is no offline-install/PWA claim in this beta.

## Development

Use the pinned pnpm version, install dependencies, then run `pnpm test`, `pnpm typecheck` and `pnpm build`.

The application requires Web MIDI with SysEx permission for hardware access. Its project editor, JSON import/export and local storage do not require a connected controller. There is no account, application backend, cloud configuration storage or analytics.

Deployment uses a multi-stage Dockerfile serving static assets through Coolify. Configuration and MIDI traffic remain in the browser.

## License

[MIT](LICENSE), copyright 2026 Matheus Monteiro and Chocolate Studio contributors. Third-party dependencies retain their own licenses.
