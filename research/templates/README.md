# Destination catalog and controller templates — proposal

**Review-only data contract. Nothing here is loaded by the application. Do not implement until the product design is approved.** No scripts, dependencies, network service, MIDI sender, or hardware capability are supplied by these files.

## Review these files

| File | Purpose |
| --- | --- |
| [`catalog.schema.json`](catalog.schema.json) | One bounded JSON Schema, draft 2020-12; validates either document kind. |
| [`line6-m5.json`](line6-m5.json) | Self-contained exact-model profile: bilingual actions/setup, deterministic PC/CC bindings, primary evidence, unavailable features. |
| [`line6-m5-tap-hold.template.json`](line6-m5-tap-hold.template.json) | Proposed Chocolate A short/hold assignments, separately named M5 instance and channel. Other switches are absent, **not cleared**. |
| [`../devices/line6-m5.md`](../devices/line6-m5.md) | Verified command table, connection/setup limits, proposed novice flow, evidence boundary. |

The original manuals are inventoried in main’s `research/manuals/README.md` (commit `b77133e`); the profile also supplies the primary HTTPS source, revision, PDF pages, and original-PDF hash. Private captures/configuration do not belong in catalogs.

## Three separate identities

- **Destination profile**: exact `modelId` + `profileVersion`; shared MIDI knowledge, no physical device ID, channel, controller mode, gesture duration, or user preset names. `schemaVersion: 1` versions the data format independently.
- **Physical destination instance**: unique `instanceId`, exact model/profile version, editable name, explicit channel 1–16. Two M5s can use one profile but have different names/channels. Channel 1 in the example is a suggestion to confirm, not detection. Do not infer an instance from its display name.
- **Controller template**: versioned selection of actions for physical A–D and a required behavior. It references named instances and pinned profiles. Omitted switches retain their existing configuration. Never expose E/F as editable switches; their physical-combination and mode-dependent banking behavior is controller knowledge.

Profiles contain **musical intent**, not a preset audio library. User labels may be Unicode and do not change PC values. Profile selection must not rename or overwrite existing user presets.

## Deterministic binding rules

Only two message forms exist in v1: PC and CC. Preserve message-array order. `channel: "destination"` resolves to the invocation’s named physical instance; resolve every message to an explicit 1–16 channel before encoding.

A value is exactly one of:

- `{ "constant": 127 }` → 127;
- `{ "parameter": "preset-number", "offset": -1 }` → integer input plus the literal offset.

No expression parser, eval, script URL, callback, arbitrary property path, implicit coercion, clamping, randomization, hidden toggle state, or remote lookup. Parameter ranges are inclusive integers; `initial` is only the proposed form’s starting value, never permission to fill a missing invocation parameter silently. Require exactly the declared parameters. Resolve and range-check all output bytes before accepting a draft. Unknown bindings fail closed, not as a generic fallback.

M5 examples: preset 1 → PC0, preset 24 → PC23; effect Off → CC11=0, On → CC11=127; expression position → CC1=0–127. No M5 CC0/CC32 prefix. Another documented device may declare an ordered CC0, CC32, PC array; no brand-specific UI branch is needed. Clock is not a PC/CC message and has **no binding** in this schema. Its documented M5 receive function stays in `unavailable`, requiring separately qualified clock output and a later reviewed protocol extension. No profile can grant that capability to Chocolate.

## Controller semantics and capability gates

| Behavior | Primary sequence | Secondary sequence |
| --- | --- | --- |
| `single` | Short press | Empty |
| `alternate` | First alternating press | Next alternating press |
| `momentary` | Press | Release |
| `long` | Long press | Empty |
| `shortLong` | Exclusive short press | Exclusive long press |

These are **required intent semantics**, not proof of a connected controller’s execution. Existing domain mapping is primary → `actions[0].messages`, secondary → `secondaryMessages`, with `behavior` preserved. For `shortLong`, do not also add a separate domain long-press action: the controller adapter maps the two sequences. No default hold milliseconds, dispatch-on-down assumption, double press, or sequence timing is defined by the destination profile.

Future consumer must intersect the action requirements, behavior requirements, exact controller/mode/firmware qualification, route, message-count limits, and setup completion. Baseline PC/CC capability names are `midi.pc` / `midi.cc`; the example additionally requires `gesture.short-long-exclusive`. Derive these requirements as well as checking the declared list: omission cannot bypass a gate. Unknown capability IDs block application. A fixed expression position needs a CC sender; continuous expression also needs a qualified variable-input source. A route ending in DIN output must actually exist; naming one does not implement routing.

Schema-valid, manufacturer-documented, stored/readback-verified, and **destination-response-verified** are distinct. Every current action is `hardwareVerification.status: "not-tested"`. A later destination-response claim needs a reviewed public report, exact destination/controller models, qualified firmware scope (state unknown honestly), and the actual observed response. Chocolate storage ACK/readback does not qualify. Unavailable entries are explanatory, never selectable invocations.

## Add the next profile without touching UI

**Proposed future integration contract:** discover bundled `kind: "destination-profile"` JSON files deterministically at build time, keyed by exact model/version. Render labels, instructions, integer parameters, action availability, and unavailable reasons from this schema’s fixed vocabulary. No model-name conditionals, translation-module edits, fetching at runtime, or profile-provided components. The current app does not implement this contract yet.

1. Copy the profile shape to `<manufacturer>-<exact-model>.json`. Assign a new exact `modelId`; start `profileVersion` independently. Do not alias similar models or assume another model’s commands.
2. Read the manufacturer’s exact-model primary manual. Record publisher, revision, URL, page/section per action, and hash when available. Document unspecified features as unavailable, not guessed. Keep hardware status untested until destination-response evidence exists.
3. Supply both `en` and `pt-BR` labels/instructions/errors-by-unavailable-reason. Add bounded parameters and only supported declarative PC/CC messages. Describe channel/connection setup and prerequisites.
4. Add a separate named-instance template only if useful. Pin each profile version, choose an editable channel, require the actual controller behavior, and preserve unmentioned switches/opaque bytes. Never bundle personal names, port IDs, FCP images, or captures.
5. Validate structure **and semantics** below, review example byte expansions, and obtain design review. A new PC/CC profile using this vocabulary requires data changes only. A new protocol, control type, transform, or controller gesture needs a separate reviewed schema/adapter design; do not hide it in a string field.

**PT-BR — próximo perfil:** copie a estrutura; use modelo exato e versão próprios; cite manual primário e páginas; traduza todos os textos; declare apenas PC/CC documentados; mantenha instância/canal e gestos no template; valide limites/referências/bytes e peça revisão. Não altere componentes de UI nem copie comandos de outro modelo.

## Validation and import boundary

[Draft 2020-12](https://json-schema.org/draft/2020-12/schema) validation checks shape, types, required locales, closed fields, bounded arrays/strings, parameter envelopes, constant MIDI byte bounds, channel bounds, A–D-only assignments, and required secondary sequences. All references in the schema are local; validate offline with a conforming validator. Do not depend on optional `format` assertions for safety.

**Required semantic checks, not expressible by this small schema:**

- Reject duplicate source/action/setup/instance IDs and ambiguous model/version catalog entries. Resolve every citation, setup requirement, destination instance, pinned profile, and action. Unavailable IDs cannot be invoked.
- Require `minimum <= initial <= maximum`; reject unknown/missing invocation parameters and values outside the action-specific range (e.g. M5 preset 25 is invalid although it fits MIDI). Exhaustively expand every bounded parameter value and require all resulting PC/controller/value bytes to be integers 0–127. No silent clamp.
- Check action-derived PC/CC requirements and controller-behavior requirements; limits apply after expanding invocations, not just before. Capability claims and primary-document truth still require review. Check connection metadata consistency, e.g. direct USB requires a USB MIDI port.
- At any future untrusted JSON import boundary: cap encoded file size (proposed 256 KiB per catalog/template), depth (16), and nodes (100,000); reject duplicate JSON keys, unknown schema versions and `__proto__`/`prototype`/`constructor` keys anywhere before constructing lookup objects. Use safe maps. Resolve source URLs as evidence only, never execute/fetch-on-import.
- Validate generated intent against existing aggregate/domain limits and the connected adapter’s stricter limits; reject atomically. Template creation/import is draft-only. Preserve imported opaque bytes and custom Unicode names, with review and backup before replacement or hardware writes.

## Validation result — 2026-11-08

Passed with disposable Python `jsonschema` 4.26.0 / `Draft202012Validator` and in-memory semantic/expansion checks, outside app dependencies:

- Draft-2020-12 meta-schema valid; both profile and template validate.
- All seven actions expand within MIDI bounds across their complete declared integer ranges. Verified preset 1→PC0, preset 24→PC23, channels 1/16, expression 0/127, and two independently named M5 instances on different channels.
- Required A example expands to primary `[192, 0]` and secondary `[192, 1]` on channel 1: PC0 and PC1, without bank-select messages.
- **34 negative cases rejected**: 16 structural cases (including unknown version, missing translation, invalid MIDI bytes/channels, executable transform, clock message, prototype key, editable E, missing secondary, and unsupported hardware claim); 18 semantic cases (including M5 preset 0/25, unresolved/duplicate identities, wrong exact model/version, unavailable action, parameter/reference errors, expanded-byte overflow, missing capabilities, and contradictory USB metadata).

These checks validate proposed data, not application behavior or hardware. No runtime implementation, app dependency changes, UI/browser actions, MIDI, or hardware tests were performed. File-size/depth/node import defenses above remain requirements for a future consumer, not an implemented parser.
