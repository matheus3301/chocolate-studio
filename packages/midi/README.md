# @chocolate-studio/midi

Client-only, framework-independent TypeScript intent model. No Web MIDI access,
storage, translations, device profiles, or Chocolate protocol implementation.

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

- `StudioConfiguration`: `formatVersion: 1`, stable `id`, custom `name`,
  `destinations`, `groups`, and `presets` arrays. Only version 1 is accepted.
- `Destination`: `id`, `name`, default `channel` (1–16). Message and preset
  channels are always explicit; destination defaults never override them.
  Optional `destinationId` references must resolve within the configuration.
  A destination reference describes routing intent, not an opened MIDI port.
- `Group`: `id`, `name`, `switches: { A, B, C, D }`. Each switch has `label`
  and `actions: GestureAction[]`. At most one action for each of `press`,
  `release`, `longPress`, `doublePress`; an empty actions array is allowed.
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
`GestureAction`, `Gesture`, `SwitchId`, and `CcToggle`.
`encodeProgramChange(channel, program)` and
`encodeControlChange(channel, controller, value)` encode a single message.
Invalid encoder inputs throw Zod validation errors instead of masking/truncating.
CC numbers 120–127 encode channel-mode messages; their device-specific
semantics are not validated here.

### JSON boundary and limits

`importConfiguration(text)` never throws for malformed JSON text. It returns
`{ success: true, data }` or `{ success: false, error }`; `error.code` is
`syntax`, `size`, or `validation` (with Zod `issues` and field paths).
Unknown versions/keys, missing switches, duplicate IDs/gestures, unresolved
references and invalid values are rejected, not repaired or silently stripped.
Imports and exports validate the whole configuration. Export throws on invalid
input (Zod error) or oversized serialized output (`RangeError`).

`CONFIGURATION_LIMITS`: 1 MiB UTF-8 JSON; 32 destinations; 1–64 groups;
256 presets; 4 actions/switch; 1–32 messages/action; 4096 messages total;
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
