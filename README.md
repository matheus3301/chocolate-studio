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

1. Open the site in a desktop browser supporting Web MIDI with SysEx. The connection wizard helps you choose the controller ports, read the full configuration and preserve its original backup. You can also edit without connecting.
2. Choose the receiving equipment and its MIDI channel. The first supplied profile is the Line 6 M5; **Advanced MIDI** works with other destinations. Profiles describe musical actions and their parameters, rather than separate brand-specific interfaces.
3. Select A, B, C or D, choose an action and apply it to the draft. Add a hold action if needed. For example, tap A selects M5 preset 1 and hold A selects preset 2. Existing raw sequences remain available under Advanced MIDI.
4. Review and save to Chocolate. The adapter compares the complete baseline, writes, and rereads every byte before reporting a verified configuration. Then test the switches on the receiving equipment separately.
5. Use **Project & files** to save in this browser or download/open a versioned JSON project. Equipment intentions and raw MIDI are preserved together.

The fixed Program Change mode's 000–127 display positions are not 128 freely programmable tap/hold slots. Custom assignments use the independently mapped eight-group Advanced layout; changing modes is explicit in the write review. E/F markings reflect A+B and C+D, with navigation dependent on the controller mode.

New equipment profiles are data in `packages/midi/src/equipment-profiles.json`; see the [profile authoring contract](research/templates/README.md) and [MIDI package](packages/midi/README.md). The catalog supplies Portuguese/English labels, parameter ranges and deterministic MIDI mappings. Unknown pinned profile versions preserve raw commands without guessing their meaning.

JSON imports replace the draft only after review and automatic local backup. FCP imports are complete device backups, clearly marked unverified until restored and reread; they are not editable project JSON. Browser data stays on this origin/device: export files to transfer or retain an independent copy. There is no offline-install/PWA claim in this beta.

## Development

Use the pinned pnpm version, install dependencies, then run `pnpm test`, `pnpm typecheck` and `pnpm build`.

The application requires Web MIDI with SysEx permission for hardware access. Its project editor, JSON import/export and local storage do not require a connected controller. There is no account, application backend, cloud configuration storage or analytics.

Deployment uses a multi-stage Dockerfile serving static assets through Coolify. Configuration and MIDI traffic remain in the browser.

## License

[MIT](LICENSE), copyright 2026 Matheus Monteiro and Chocolate Studio contributors. Third-party dependencies retain their own licenses.
