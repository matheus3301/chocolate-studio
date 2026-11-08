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
| `347d..34c4` | 72 | Keyboard: 6 groups × 4 switches × 3 bytes; `comBoxChange 0x10008a00f..0x10008a031` |
| `34c5..5c54` | 10128 | Mixed: 6 groups × 4 switches; group stride `0x698`, switch stride `0x1a6`; `updateAList 0x10008852f..0x100088554` |
| `5c55..5c5d` | 9 | Global limits, selected groups and flags |

Byte 11 and both 128-byte custom MIDI payloads in each Advanced/Mix switch
remain opaque. Keyboard combinations and mixed prefix/bank fields have narrow editors.

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
Mode labels and raw IDs are joined by member bindings below, not UI ordering.
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
Interface slots have a separate endpoint representation documented below.

| Byte | Meaning | Patch bounds / provenance |
| --- | --- | --- |
| `+0` | Enabled flag | Writes 0/1; add `0x100093f69..0x100093f71`, edit `0x10008daac`; list checks nonzero |
| `+1` | Channel index | 0–15; UI range 1–16 at `editBankA 0x10008d2f9..0x10008d303`; subtract 1/store `0x10008da9f..0x10008daa5` |
| `+2` | Type menu index | 0 PC, 1 CC, 2 Note ON, 3 Note OFF, 4 custom; ordered list `init 0x1000825ee..0x10008273f`; store `0x10008db1c` |
| `+3` | PC program / CC controller | 0–127; `editBankA 0x10008d611..0x10008d616`, store `0x10008dad6` |
| `+4` | CC value / unused for PC | CC 0–127; range `0x10008d729..0x10008d72e`, store `0x10008daf9`; PC spare preserved |

No running-status byte is stored in a record: type is a menu index; channel is separate.
Notes use type 2/3, data1 note and data2 velocity, each 0–127; Advanced/Mix note
editors share the observed five-byte record writer. Custom/unknown records remain raw.
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
| Interface endpoint | Record start, length 5 | `0x000d`, length `0x50` | `editInterface 0x10008cd9c..0x10008ce13`; `updateInterfaceList 0x10008c5de..0x10008c60d` |
| Clear record | Record enabled byte | Its containing interface/Advanced/Mix range | Same list-update ranges; no compaction performed here |

These ranges are byte-image facts, not recommendations to send a range as one
packet. The validated coordinating transport chunks at **1024 bytes maximum**.
No transport, chunker, sender, firmware support assertion, or hardware side effect
exists in this package. Scalar patches do not silently update dependent UI state,
selected groups, other banks, or opaque bytes.

## Operating-mode label bindings

Dialog UI begins at `+0x10d8`. `init 0x100081d24..0x100081eae`
passes each member to `QButtonGroup::addButton` with an explicit ID.
`Ui_FootCtrlPlus::retranslateUi 0x1000949d1..0x100094ee6` attaches labels
to those same members relative to the UI base. This join gives:

| Raw | Dialog member | CubeSuite label |
| ---: | --- | --- |
| 0 | `10f8` | Program change A |
| 1 | `1100` | Program change B |
| 2 | `1158` | Custom mode |
| 3 | `1108` | Advanced custom mode |
| 4 | `1110` | Manufacturer control |
| 5 | `1118` | Touch screen (Android) |
| 6 | `1120` | Video Model |
| 7 | `1148` | Keyboard A |
| 8 | `1128` | Keyboard B |
| 9 | `1130` | MultiMedia keyboard |
| 10 | `1150` | Custom keyboard mode |
| 11 | `1160` | Mix key |
| 12 | `1168` | Speaker mode |

Tooltip `init 0x1000820ae..0x10008241a` describes fixed PC, sequential CC,
custom selectors, Advanced, manufacturer control, Android swipes, video,
arrows, Page Up/Down/Space/Enter, media controls, custom keyboard, mixed and
speaker respectively. These descriptions are not observed MIDI/HID emission.
Newer manuals contain additional modes; their numbering is not this raw-ID map.

The installed Advanced tooltip at `0x100082189` explicitly says E/F change groups.
The stored software manual's Advanced 1 description says they do not. This is
conflicting host/manual evidence, not grounds to disable E/F or promise live
navigation. Physical qualification is pending. `advancedGroupIndex`,
`keyboardGroupIndex` and `mixGroupIndex` are explicit stored current/initial
group fields; local editor selection must not silently write them.

Coordinator-reported full hardware read/write/restore experiments
`own-operating-modes-001-summary.json` and `own-operating-settings-001-summary.json`
qualify storage of all mode bytes 0–12 and the 20 scalar global fields listed above:
each ACK was followed by a complete exact expected-image read, restoration and
complete original-image comparison. This worker did not access hardware.
Physical events, HID/MIDI routing and power-cycle persistence remain unverified.

## Custom command selectors

Constructor `0x100073553..0x100074447` builds the custom-name array at dialog
`+0x30`, eight-byte QString stride. `init 0x100082776..0x10008279e`
indexes it for the four selectors. Indexes 0–127 are CC selectors.
The final six names come from relative offsets `0x400..0x428`:

| Index | CubeSuite name | Constructor instruction |
| ---: | --- | --- |
| 128 | Mono Afertouch | `1000743af` |
| 129 | Start current sequence | `1000743cc` |
| 130 | Stop current sequence | `1000743e9` |
| 131 | Continue where stopped | `100074406` |
| 132 | Pin Receiver | `100074423` |
| 133 | Restore power-up state | `100074440` |

Interface-name array starts dialog `+0x890` at `0x100075354`;
`init 0x100082b0d..0x100082b35` indexes 130 entries.
Indexes 0–127 are CC, 128 Select Preset (`0x1000761b3`), 129 Mono
Aftertouch (`0x1000761d0`). Names are host menu evidence, not command status
bytes. “Pin Receiver” is retained literally; its intended meaning is uncertain.
The four visual flags have confirmed byte footprints and checkbox labels only;
their firmware-level on/off semantics are not established by the host writer.

## Keyboard combinations

`K = 0x347d + group × 12 + switch × 3`, group 0–5, switch A–D.
At K, K+1 are modifier codes; K+2 is the main key menu index.
`comBoxChange 0x10008a058..0x10008a384` stores modifiers as zero for None
or selector index + `0x3e`; selectors 1–4 therefore store 63–66.
Nonzero duplicate modifiers are rejected by the host comparisons
`0x10008a031..0x10008a051` and the second-selector mirror.
The last keyboard switch 5/D occupies `0x34c2..0x34c4`.

`init 0x100083102..0x100083e3f` builds main-key menu order:
None, A–Z, Up/Down/Left/Right, Page Up/Down, Space, Enter, Escape, Delete,
Caps Lock, Tab, 0–9, +, −, F1–F12 (indexes 0–62).
The separate modifier list `0x100083fa4..0x10008409f` is
None, Ctrl, Shift, Alt, Win/Command (indexes 0–4).
These are CubeSuite indexes, not ASCII or HID usage codes.
Each key/modifier handler sends exactly its one changed byte.

## Mixed switches

`M = 0x34c5 + group × 0x698 + switch × 0x1a6`, group 0–5, switch A–D.

| Relative M | Size | Meaning |
| --- | ---: | --- |
| `000` | 1 | Function 0 MIDI, 1 keyboard, 2 Turner |
| `001` | 1 | Turner menu index 0–9 |
| `002..004` | 3 | Keyboard combination, same encoding as K |
| `005` | 1 | MIDI switch mode 0–4 |
| `006..055` | 80 | MIDI bank A, 16 five-byte records |
| `056..0a5` | 80 | MIDI bank B, 16 five-byte records |
| `0a6..125` | 128 | Opaque custom MIDI A |
| `126..1a5` | 128 | Opaque custom MIDI B |

Function IDs: `init 0x100081beb..0x100081c3f`, dialog members
`1288/1290/1298`; labels `retranslateUi 0x100096062..0x100096139`,
UI members `1b0/1b8/1c0`. Writer `checkedMixKeyType 0x10008688f..0x10008693f`
changes/sends only M. Turner selector writer `comBoxChange 0x10008ab43..0x10008abf4`
changes/sends only M+1; list `init 0x100083349..0x100083638` orders
Up, Down, Left, Right, Page Up, Page Down, Previous track, Next track,
Volume −, Volume +. “Turner” is the host's literal label.
Keyboard writers `comBoxChange 0x10008a3b6..0x10008a78d` change M+2..4.
Switch-mode writer `checkedFootSwitchMode 0x100089b0b..0x100089ce2` changes M+5.

`editBankA 0x10008dec3..0x10008e90d` computes/writes M+6+5×slot;
`updateBList 0x1000890bf..0x1000890eb` computes M+5+0x51+5×slot.
Both list updates send the entire mixed region (`0x34c5`, `0x2790`), not
Advanced. Last switch 5/D is `0x5aaf`; its final B record begins `0x5b50`,
and opaque custom B ends `0x5c54`. No patch compacts records or resets other functions.

Advanced and mixed are independent stored regions. Mode-only edits change byte
zero only; no draft data may be reinterpreted into the other region. The intent
schema keeps `groups` (Advanced) separate from optional `mixedGroups` (Mix).


## Interface pedal endpoint bank — corrected representation

Unlike Advanced/Mix MIDI banks, the sixteen five-byte interface slots have NO
message-type byte. Prior PC/CC interpretation was incorrect and is removed.
`editInterface 0x10008c8a0` computes `I = 0x0d + slot × 5`
(`0x10008c925`) and builds four spin boxes, not a MIDI-type selector.

| Byte | Meaning | Bounds / own writer |
| --- | --- | --- |
| `I+0` | Enabled | 0/1; set 1 `0x10008cda3` |
| `I+1` | Channel index | UI 1–16, stores −1 `0x10008cd9c` |
| `I+2` | Data | 0–127; store `0x10008ce13` |
| `I+3` | Loosen Value / release endpoint | 0–127; store `0x10008cdc6` |
| `I+4` | Step On Value / press endpoint | 0–127; store `0x10008cde9` |

CString labels referenced at `0x1002770b8`, `0x1002770c2`, `0x10027510c`,
`0x1002770d8`; respective spin ranges at `0x10008ca61..0x10008ca6b`,
`0x10008caf5..0x10008cafc`, `0x10008cb84..0x10008cb8b`,
`0x10008cc13..0x10008cc1a`. Evidence was re-read from our own installed binary
disassembly after coordinator inspected the actual interface editor.
No PC/CC/Note interpretation is assigned to these fields.

`interfaceAssignment` writes exactly these five bytes; `clearInterfaceAssignment`
changes enabled only. Both report CubeSuite send range `0x0d`, length `0x50`.
Disabled/malformed records retain raw fields and decode assignment=null.
The obsolete `message`/`clearMessage` scope `'interface'` is rejected rather than
kept as an unsafe compatibility path.

