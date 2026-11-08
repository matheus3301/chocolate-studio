# FCP observed layout and provenance

## Evidence scope

Own analysis of `/Applications/CubeSuite.app/Contents/MacOS/CubeSuite`, unstripped
Mach-O x86_64, SHA-256
`1730799b103cb3c029ca9d1999e7355e20342f5a99d338cca963cf127140c88f`.
Symbols from `nm -C`; instructions from Apple's `llvm-objdump`; imported Qt
function names resolved through `otool -Iv`. Disassembly and extracted strings
remain private under the coordinator's evidence/disassembly directory. No
community code, definitions, tables, or private baseline bytes were used in source/tests.
Addresses below are executable virtual addresses, not FCP byte offsets.
All methods are `FootCtrlPlusDlg::` unless prefixed otherwise.

`initDataByUSB` at `0x1000864b0`, specifically `0x1000864ce..0x1000864e2`,
reads flash type **4**, address **0**, length **0x5c5e = 23646**, into dialog object
**+0x1470**. Therefore an access at dialog +N maps to FCP offset N−0x1470.
No file signature, firmware discriminator, embedded checksum, or required
normalization has been identified in this image. Transport checksum is separate.

### Coordinator hardware evidence (reported, not rerun by this worker)

- Independent native read: full image in sequential chunks of at most 1024 bytes;
  exact SHA match with the original CubeSuite export, without normalization.
- Channel byte offset 2: write index 0→1, successful ACK, full read showing only
  that byte changed, restore index 0, full read matching the original SHA.
- Advanced bank storage: full `0x5d/0x3420` region writes, then mode 3; group 0/A
  mode 1, PC17/channel5 in A and CC69=127/channel5 in B; group 7/D mode 4,
  CC32=2 then PC127/channel16 in A, CC64=0/channel1 in B. Full read matched
  independently constructed expected image (20 changed bytes), then restoration
  matched the original SHA.
- Actual compiled TypeScript `applyFcpPatches` produced exactly that independently
  constructed image. Actual `ProtocolSession.writeAndVerify` over the native
  transport wrote the region and mode; full read matched. Restore and full read
  again matched the original SHA. Private evidence: `own-typescript-banks-001.json`
  and `verify-library-banks.mjs`, following `own-write-banks-001.jsonl`.

This qualifies actual native transport and layout **storage** for that experiment.
Physical stomps, emitted MIDI, timing, power-cycle persistence, other firmware,
and factory reset/recovery through reset remain unverified. Recovery demonstrated
here is restoring the retained original bytes and verifying a complete read.
No private evidence payloads are published with this package.

## Whole-image extents

Inclusive byte ranges; all field widths below are one byte unless specified.

| FCP bytes | Size | Interpretation / provenance |
| --- | ---: | --- |
| `0000..000c` | 13 | Mode/interface/channel/custom selectors; byte `000b` opaque |
| `000d..005c` | 80 | Interface bank: 16 × 5-byte records; `addInterface 0x100093dd9..0x100093dee` |
| `005d..347c` | 13344 | Advanced: 8 groups × 4 switches; `updateAList 0x100087f37..0x100087f88` |
| `347d..34c4` | 72 | Keyboard storage extent; `comBoxChange 0x10008a00f..0x10008a031`; opaque here |
| `34c5..5c54` | 10128 | Mixed storage extent; group stride `0x698`, switch stride `0x1a6`; `updateAList 0x10008852f..0x100088554`; opaque here |
| `5c55..5c5d` | 9 | Global limits, selected groups and flags |

The keyboard/mixed regions and byte 11 have no mutation API. Each advanced switch
also contains two opaque 128-byte custom payload areas, exposed as extents only.

## Mode and globals

Names are package identifiers for raw fields. `channelIndex` is 0–15, not 1–16.
Menu selectors are **indexes**, not a claim that their value directly encodes CC.
Minimum is zero for every field. All scalar CubeSuite send footprints are exactly
one byte at the same FCP offset.

| Field | FCP offset | Maximum | Store / limit provenance |
| --- | ---: | ---: | --- |
| `mode` | `0000` | 12 | `checkedMode 0x1000877c6`; bindings `init 0x100081d24..0x100081eae` |
| `interfaceType` | `0001` | 1 | `checkedInterfaceType 0x100087754`; bindings `init 0x100081c97..0x100081ccc` |
| `channelIndex` | `0002` | 15 | `btnClick 0x100093b53..0x100093d2f`; lower bound 0, upper compare at `0x100093c74` |
| `visualA` | `0003` | 1 | `visualClick 0x10008ac5b..0x10008ac5d` |
| `customCommandA` | `0004` | 133 | `comBoxChange 0x100089d28`; 134-entry loop `init 0x100082776` |
| `visualB` | `0005` | 1 | `visualClick 0x10008acbe..0x10008acc0` |
| `customCommandB` | `0006` | 133 | `comBoxChange 0x100089d8b`; same 134-entry loop |
| `visualC` | `0007` | 1 | `visualClick 0x10008ad29..0x10008ad2b` |
| `customCommandC` | `0008` | 133 | `comBoxChange 0x100089df6`; same 134-entry loop |
| `visualD` | `0009` | 1 | `visualClick 0x10008ad94..0x10008ad96` |
| `customCommandD` | `000a` | 133 | `comBoxChange 0x100089e61`; same 134-entry loop |
| opaque | `000b` | — | No confirmed scalar writer; preserve |
| `interfaceCommand` | `000c` | 129 | `comBoxChange 0x100089ecc`; 130-entry loop `init 0x100082b0d` |
| `pcMaxGroupIndex` | `5c55` | 31 | `comBoxChange 0x10008aa06`; `updateGroupMaxBank 0x100087d5e` |
| `ccMaxGroupIndex` | `5c56` | 31 | `comBoxChange 0x10008aa62`; `updateGroupMaxBank 0x100087ddf` |
| `advancedMaxGroupIndex` | `5c57` | 7 | `comBoxChange 0x10008aacc`; `updateGroupMaxBank 0x100087e73` |
| `advancedGroupIndex` | `5c58` | 7 | `comBoxChange 0x10008a7ba`; eight-entry loop `init 0x100084516` |
| `keyboardGroupIndex` | `5c59` | 5 | `comBoxChange 0x100089f37`; six-entry loop `init 0x1000843c4` |
| `polarity` | `5c5a` | 1 | `visualClick 0x10008ae01`; UI name `setupUi 0x10007ea5a..0x10007ea6f` |
| `bankMidi` | `5c5b` | 1 | `visualClick 0x10008ae69`; `initView 0x10008af6e`; UI checkbox name only, semantics not expanded |
| `pcDisplay` | `5c5c` | 1 | `visualClick 0x10008aece`; UI name `setupUi 0x10007f71e..0x10007f733` |
| `mixGroupIndex` | `5c5d` | 5 | `comBoxChange 0x100089f97`; six-entry loop `init 0x1000845e1` |

Interface type IDs: 0 expression pedal, 1 TRS-MIDI (static UI bindings/labels).
Mode 3 selects advanced; mode 11 selects mixed. Other modes remain numeric.
Important CubeSuite inconsistencies: `initView 0x10008b047` clamps mode to 11
although `init` binds mode 12; its custom selector clamps use 134/130 although
the population loops create only 134/130 entries (valid indexes 0–133/0–129).
The package preserves incoming raw values and reports domain issues; it never
copies these display clamps into stored bytes. Mode 12 is accepted as an observed
writable UI ID, not a claim that CubeSuite can reload it without changing selection.

## Advanced groups, switches and both banks

Zero-based group `g ∈ 0..7`, switch `s ∈ 0..3` (A/B/C/D):

`S = 0x005d + g × 0x0684 + s × 0x01a1`

| Relative to S | Size | Field |
| --- | ---: | --- |
| `+000` | 1 | Switch mode code, 0–4 |
| `+001..+050` | 80 | Bank A: 16 fixed five-byte records |
| `+051..+0a0` | 80 | Bank B: 16 fixed five-byte records |
| `+0a1..+120` | 128 | Custom A payload, opaque |
| `+121..+1a0` | 128 | Custom B payload, opaque |

Formulas: `updateAList 0x100087f37..0x100087f88`,
`updateBList 0x100088ac7..0x100088b18`. Custom A extent:
`editBankA 0x10008d887..0x10008d89b`; custom B's `+0x121`/128-byte extent:
`editBankB 0x10008f9e7..0x10008f9fb`. Last switch 7/D begins `0x32dc`;
its final B record begins `0x3378`; its custom B payload ends `0x347c`.
Eight-group bounds: `init 0x100084516`, `updateGroupMaxBank 0x100087e73`.

Switch IDs/mode IDs are bound by `init 0x100081ef1..0x100082063`.
Static mode labels in `Ui_FootCtrlPlus::retranslateUi` at
`0x10009524f..0x1000953d3` give `FCP_SWITCH_MODES`:
0 single, 1 alternate, 2 momentary (press/release), 3 long, 4 shortLong.
Those labels do not validate exact thresholds, repeat behavior, or emitted events.

### Five-byte record

Slot `i ∈ 0..15`: A address `S+1+5i`; B address `S+0x51+5i`.
Interface slot address is `0x0d+5i` and has the same representation.

| Byte | Meaning | Patch bounds / provenance |
| --- | --- | --- |
| `+0` | Enabled flag | Writes 0/1; add `0x100093f69..0x100093f71`, edit `0x10008daac`; list checks nonzero |
| `+1` | Channel index | 0–15; UI range 1–16 at `editBankA 0x10008d2f9..0x10008d303`; subtract 1/store `0x10008da9f..0x10008daa5` |
| `+2` | Type menu index | 0 PC, 1 CC, 2 Note ON, 3 Note OFF, 4 custom; ordered list `init 0x1000825ee..0x10008273f`; store `0x10008db1c` |
| `+3` | PC program / CC controller | 0–127; `editBankA 0x10008d611..0x10008d616`, store `0x10008dad6` |
| `+4` | CC value / unused for PC | CC 0–127; range `0x10008d729..0x10008d72e`, store `0x10008daf9`; PC spare preserved |

No running-status byte is stored in a record: type is a menu index, channel is
separate. Notes/custom/unknown records remain raw; only PC/CC edits are provided.
A clear patch changes only enabled. CubeSuite list refresh may compact enabled
records or normalize custom banks; **this package deliberately does not**.
`updateAList 0x100088109..0x100088334` shows the custom-type branch.

## Exact field footprints versus CubeSuite send ranges

| Operation | Allowed modified bytes | CubeSuite send range | Provenance |
| --- | --- | --- | --- |
| Scalar/global | The one field byte | Same one byte | Each scalar setter above |
| Advanced switch mode | `S`, length 1 | Same one byte | `checkedFootSwitchMode 0x1000898a9`, `0x100089ad7..0x100089adf` |
| Advanced PC | Record start, length 4 | `0x005d`, length `0x3420` | `editBankA 0x10008daa5..0x10008db1c`; `updateAList 0x1000884d5..0x100088504` |
| Advanced CC | Record start, length 5 | Same entire advanced region | `updateBList 0x100089065..0x100089094` |
| Interface PC/CC | Record start, length 4/5 | `0x000d`, length `0x50` | `updateInterfaceList 0x10008c5de..0x10008c60d` |
| Clear record | Record enabled byte | Its containing interface/advanced range | Same list-update ranges; no compaction performed here |

These ranges are byte-image facts, not recommendations to send a range as one
packet. The validated coordinating transport chunks at **1024 bytes maximum**.
No transport, chunker, sender, firmware support assertion, or hardware side effect
exists in this package. Scalar patches do not silently update dependent UI state,
selected groups, other banks, or opaque bytes.
