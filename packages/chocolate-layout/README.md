# @chocolate-studio/chocolate-layout

Independent, client-only TypeScript FCP layout decoder and immutable field patcher.
No dependencies on MIDI intent, Chocolate transport, React, storage, or hardware.
Own static analysis of the installed CubeSuite executable only; no community
protocol/code, private configuration fixtures, or proprietary disassembly included.
See [MAPPING.md](./MAPPING.md) for offsets, limits, footprints and function/address provenance.

```ts
import {
  FCP_SIZE, FCP_SWITCH_MODES, decodeFcp, applyFcpPatches,
} from '@chocolate-studio/chocolate-layout';
import type { FcpPatch, DecodedFcp } from '@chocolate-studio/chocolate-layout';

// input is an existing 23,646-byte Uint8Array, retained for recovery.
const view: DecodedFcp = decodeFcp(input);
const patches: FcpPatch[] = [
  { kind: 'field', field: 'channelIndex', value: 1 }, // Stored index 1 = channel 2.
  { kind: 'field', field: 'mode', value: 3 }, // Advanced mode.
  { kind: 'switchMode', groupIndex: 0, switchId: 'A', modeCode: FCP_SWITCH_MODES.alternate },
  { kind: 'message',
    location: { scope: 'advanced', groupIndex: 0, switchId: 'A', bank: 'A', slot: 0 },
    message: { type: 'pc', channel: 5, program: 17 } },
  { kind: 'message',
    location: { scope: 'advanced', groupIndex: 0, switchId: 'A', bank: 'B', slot: 0 },
    message: { type: 'cc', channel: 5, controller: 69, value: 127 } },
];
const { bytes, changes, footprints } = applyFcpPatches(input, patches);
// input unchanged; bytes is independent. No send or verification occurs.
```

`decodeFcp` exposes raw mode/globals, interface bank, eight advanced groups,
four switches per group, both 16-slot banks, and raw record bytes. PC/CC records
include a validated interpretation; disabled, other-type and malformed records
remain represented without repair. `issues` identifies observed field-domain
violations. Decoding never compacts slots, normalizes flags, or rebuilds bytes.
Length alone cannot identify a device/firmware version or authenticate an FCP file.

`applyFcpPatches` accepts scalar `field`, advanced `switchMode`, PC/CC `message`,
and `clearMessage` patches. Interface messages use `{ scope: 'interface', slot }`.
Clear changes only the enabled flag. PC edits preserve the unused fifth byte.
All coordinates and values are checked; unknown keys, unsafe patch objects,
overlapping writes, and batches over 2048 patches are rejected before any copy
is modified. Other unknown/invalid bytes remain untouched. `changes` is sorted,
exact before/after byte evidence; `footprints` distinguishes allowed field bytes
from the larger ranges the corresponding CubeSuite handlers send.

Footprints are **not packets**: the coordinating transport currently has evidence
for sequential chunks of at most 1024 bytes. Chunking, ACK handling, readback,
restore and verification belong outside this package. Preserve the entire input
image for recovery; never serialize a decoded partial view as a replacement image.

`FCP_FIELDS`, `FCP_LAYOUT`, `OPAQUE_REGIONS`, `advancedSwitchOffset`,
`messageOffset`, `FcpPatchResult`, `PcCcMessage`, `MessageLocation` and decoded
view types are exported. Group/slot indexes are zero-based; message channels are
1–16, but `channelIndex` fields are raw 0–15. Banks are sequences inside a switch,
never separate groups. No names, labels, destinations or audio patches are invented.

Storage layout evidence does **not** establish physical gesture timing, live MIDI
emission, power-cycle persistence, or firmware compatibility. The mode-code names
reflect CubeSuite's static UI labels, not tested stomp semantics.

Checks (after coordinator dependency installation):

```sh
npm test --prefix packages/chocolate-layout
npm run typecheck --prefix packages/chocolate-layout
npm run build --prefix packages/chocolate-layout
```

`tsconfig.build.json` emits **src only** into `dist` (ES modules and declarations);
it never emits tests. Native experiments can import `dist/index.js` directly.

All committed tests use generated synthetic bytes, never the private baseline.
Typed-array copying semantics: [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/slice).
