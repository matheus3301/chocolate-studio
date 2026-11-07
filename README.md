# Chocolate Studio

A browser-based editor for MIDI controller configurations. Initial hardware target: M-VAVE Chocolate Plus.

The product runs entirely on the client, supports Portuguese and English, and uses generic MIDI destinations and presets. The Chocolate Plus library is independently developed from controlled observations of CubeSuite and hardware experiments.

## Workspace

- `packages/chocolate`: hardware protocol, configuration codecs and transport contracts.
- `packages/midi`: generic MIDI messages, destinations and configuration models.
- `apps/lab`: protocol research and hardware verification workbench.
- `apps/web`: public configuration editor.
- `research/experiments`: reproducible procedures and findings.
- `research/fixtures`: deliberately prepared test evidence, with provenance.

## Status

Research and implementation in progress. Hardware operations are released only after observation and verification. No factory-reset capability is assumed.

## Development

Use the pinned pnpm version, install dependencies, then run `pnpm test`, `pnpm typecheck` and `pnpm build`.

Deployment uses a multi-stage Dockerfile serving static assets through Coolify. Configuration and MIDI traffic remain in the browser.
