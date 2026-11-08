# @chocolate-studio/midi

Client-only, framework-independent TypeScript intent model with declarative
equipment profiles. No Web MIDI access, storage, UI framework, or Chocolate protocol.

## API

```ts
import {
  createDefaultConfiguration, importConfiguration, exportConfiguration,
  encodeMidiMessage, ccToggleMessage, presetToProgramChange,
  programToDisplay, displayToProgram,
} from '@chocolate-studio/midi';
import type { StudioConfiguration, MidiMessage } from '@chocolate-studio/midi';

const draft: StudioConfiguration = createDefaultConfiguration({
  name: 'Meu palco 🎸', destinationName: 'My MIDI destination',
});
// Four press intents A/B/C/D, programs 0/1/2/3, explicit channel 1.
const json = exportConfiguration(draft);
const result = importConfiguration(json);
if (result.success) {
  const importedDraft = result.data; // Still a draft, never a verified device state.
}

const intent: MidiMessage = {
  type: 'pc', channel: 16, program: 127, bank: { msb: 0, lsb: 32 },
  destinationId: 'destination-1',
};
const messages = encodeMidiMessage(intent); // Uint8Array[]: CC0, CC32, PC.
const on = ccToggleMessage({
  channel: 1, controller: 80, offValue: 0, onValue: 127,
}, 'on'); // No hidden toggle state; values are configurable.
programToDisplay(0, 1); // 1
displayToProgram(128, 1); // 127; base 0 is also supported.
```

### Types and validation

- `StudioConfiguration`: `formatVersion: 1 | 2`, stable `id`, custom `name`,
  `destinations`, `groups`, and `presets` arrays. New defaults use version 2;
  version 1 imports/exports retain their version and complete data without inferred bindings.
- `Destination`: `id`, `name`, default `channel` (1–16). Message and preset
  channels are always explicit; destination defaults never override them.
  Optional `destinationId` references must resolve within the configuration.
  A destination reference describes routing intent, not an opened MIDI port.
  Version 2 additionally accepts `profile?: { modelId, profileVersion }`.
- `Group`: `id`, `name`, `switches: { A, B, C, D }`. Each switch has `label`
  and `actions: GestureAction[]`. At most one action for each of `press`,
  `release`, `longPress`, `doublePress`; an empty actions array is allowed.
  Optional `behavior: SwitchBehavior` is `single`, `alternate`, `momentary`,
  `long`, or `shortLong`. Optional `secondaryMessages: MidiMessage[]` stores
  the second sequence (0–32 messages). Neither field is inserted on import,
  so existing version 1 files retain their shape; omitted behavior means single.
- `GestureAction`: `gesture` plus an ordered, nonempty `messages` array.
  `MidiMessage` is `ProgramChange` (`type: 'pc'`, `channel`, `program`,
  optional `bank: { msb?, lsb? }`) or `ControlChange` (`type: 'cc'`,
  `channel`, `controller`, `value`). Every data byte is an integer 0–127.
  Bank must contain at least one byte; only requested bytes are emitted.
- `Preset`: `id`, `name`, `channel`, `program`, optional `bank` and
  `destinationId`. This labels an actual PC/bank reference, not an audio patch.
  `presetToProgramChange(preset)` creates its PC intent.
- IDs are globally unique across configuration, destinations, groups and presets;
  1–64 ASCII alphanumeric/hyphen/underscore characters, starting alphanumeric.
  Prototype-sensitive names are reserved. User-visible names preserve Unicode.

Schemas and inferred types are exported, including `studioConfigurationSchema`,
`midiMessageSchema`, `Preset`, `Destination`, `Group`, `SwitchConfiguration`,
`GestureAction`, `Gesture`, `SwitchId`, `SwitchBehavior`, and `CcToggle`.
`encodeProgramChange(channel, program)` and
`encodeControlChange(channel, controller, value)` encode a single message.
Invalid encoder inputs throw Zod validation errors instead of masking/truncating.
CC numbers 120–127 encode channel-mode messages; their device-specific
semantics are not validated here.

### Two-sequence tooling contract

Keep A/B/C/D as switches in **one** group; sequence banks are not groups.
`actions[0].messages` is the primary sequence; `secondaryMessages ?? []`
is the secondary sequence. `alternate` means alternate sequences across
activations; `momentary` means primary on press and secondary on release;
`shortLong` distinguishes short-primary from long-secondary activation.
`single` uses the primary sequence and `long` requests long-activation primary.
Other gesture actions remain explicit independent intent; a device adapter must
reject combinations it cannot encode rather than dropping them.
No behavior name or enum position asserts a corresponding hardware mode code.

```ts
draft.groups[0]!.switches.A.behavior = 'alternate';
draft.groups[0]!.switches.A.secondaryMessages = [
  { type: 'cc', channel: 1, controller: 80, value: 0 },
];
```

### Equipment actions and version 2

`equipmentProfiles` is the validated, frozen catalog. `getEquipmentProfile(modelId,
profileVersion?)` resolves an exact pinned version, or the newest bundled semver
when omitted. `localizeEquipmentText(text, 'en' | 'pt-BR')` reads profile-owned
labels/help. Each action declares inclusive integer parameter ranges, initial
form values, ordered deterministic messages, setup/capability requirements,
primary-source citations, and separate destination-response evidence.

```ts
import { applyEquipmentAction } from '@chocolate-studio/midi';

const tap = applyEquipmentAction(draft, 'group-1', 'A', 'primary', {
  modelId: 'line6.m5', profileVersion: '0.1.0',
  actionId: 'select-preset', parameters: { 'preset-number': 1 },
  destinationId: 'destination-1',
});
const tapHold = applyEquipmentAction(tap, 'group-1', 'A', 'secondary', {
  modelId: 'line6.m5', profileVersion: '0.1.0',
  actionId: 'select-preset', parameters: { 'preset-number': 2 },
  destinationId: 'destination-1',
}, { behavior: 'shortLong' });
// Primary PC0, secondary PC1; other switches/gestures/names remain unchanged.
// shortLong is requested intent, not a claim about physical gesture execution.
```

`compileEquipmentAction(profile, actionId, parameters, destination)` returns raw
`MidiMessage[]` with explicit destination/channel. Only constants and parameter
plus integer offset are supported; no eval, implicit coercion/default filling,
clamping, hardware queries or hidden toggle state. Bad parameters, channels,
unavailable actions and mismatched model/version references throw.

`applyEquipmentAction` is immutable and atomic, upgrades only edited v1 drafts to
v2, and enforces complete configuration/serialized limits. It sets a missing
destination profile but rejects an existing different one. The optional sixth
argument also accepts `profiles`, a complete custom registry used for resolution.
It changes only the chosen sequence; behavior changes only when explicitly passed.

Version 2 stores `switch.actionBindings?: { primary?, secondary? }`. Each binding
retains `{ modelId, profileVersion, actionId, parameters, destinationId }`. Primary
means `actions[0].messages`; secondary means `secondaryMessages`. Known bindings
must exactly reproduce their raw sequence, including channel/destination. Stale
bindings fail import/export. Raw edits must explicitly remove the affected binding
first (`clearEquipmentActionBinding(config, groupId, switchId, sequence)`), or
delete that metadata atomically in the caller's draft edit. Changing a destination
channel/profile similarly requires deliberate recompilation or detachment.

Missing profile versions keep raw messages and references losslessly; they never
resolve to the latest version or acquire a fabricated musical label. Unknown-version
fallback still requires coherent destination/profile/channel references. It cannot
be recompiled until that exact profile is available. Matching raw MIDI from hardware
does not create an action binding: duplicate commands are ambiguous.

Add profiles by appending JSON data to `src/equipment-profiles.json`, without
editing the compiler or UI. The runtime vocabulary follows the research profile
semantics but omits design-only `$schema`/`status`. Public `equipmentProfileSchema`
rejects unsafe trees, unknown keys, duplicate/unresolved IDs and citations,
missing PT/EN text, invalid parameter intervals, overflow-producing mappings,
and unsupported bindings. Sources document intent, not hardware execution.

Bundled [M5 primary manual, Rev A PDF p.8](https://line6.com/data/6/0a060b316ac34f0593fa7e002/application/pdf/M5%20Pilot):
`select-preset` (`preset-number` 1–24 → PC0–23), `tap-tempo` (CC64=127),
`effect-off`/`effect-on` (CC11=0/127), `expression-position` (`position` 0–127,
CC1), `tuner-exit`/`tuner-enter` (CC69=0/127). Expression requires preset-local
endpoint setup. MIDI clock is documented separately and is not an assignable
PC/CC action. M5 DIN routing and physical Chocolate gestures remain separate
capability checks; all bundled destination responses are untested.

Version 1 forbids profile/binding metadata. No import silently upgrades versions,
converts raw messages, changes custom Unicode names, or guesses action bindings.


### JSON boundary and limits

`importConfiguration(text)` never throws for malformed JSON text. It returns
`{ success: true, data }` or `{ success: false, error }`; `error.code` is
`syntax`, `size`, or `validation` (with Zod `issues` and field paths).
Unknown versions/keys, missing switches, duplicate IDs/gestures, unresolved
references and invalid values are rejected, not repaired or silently stripped.
Imports and exports validate the whole configuration. Export throws on invalid
input (Zod error) or oversized serialized output (`RangeError`).

`CONFIGURATION_LIMITS`: 1 MiB UTF-8 JSON; 32 destinations; 1–64 groups;
256 presets; 4 actions/switch; 1–32 messages/action; 0–32 secondary messages;
4096 primary and secondary messages combined;
128 UTF-16 code units/name, 64/label (empty label allowed), 64/ID.
Tree traversal is bounded to depth 16 and 100,000 values. Plain JSON trees only:
no cycles/shared object references, accessors, custom prototypes, symbol keys,
or `__proto__`/`constructor`/`prototype` properties at any depth.
These are application safety limits, not controller capacities.

Export sorts object keys deterministically and preserves array/message order,
custom names and Unicode without normalization. It returns indented JSON with
a trailing newline. Reimport produces independent draft data.

## Intent is not hardware support

Schema success means structurally valid MIDI intent only. It does **not**
establish that Chocolate Plus or any other controller supports a gesture,
sequence, bank selection, destination routing, number of groups, or toggle.
Capability validation and observed read/write/verification belong to a separate
device adapter. Encoding emits bytes only; it never sends them or claims that
hardware accepted or retained anything. Templates remain generic.

References: [Zod 4.6.7 API](https://github.com/colinhacks/zod/blob/v4.6.7/packages/docs/content/api.mdx),
[MIDI Association message summary](https://midi.org/summary-of-midi-1-0-messages).

## Checks

```sh
pnpm --filter @chocolate-studio/midi test
pnpm --filter @chocolate-studio/midi typecheck
```
