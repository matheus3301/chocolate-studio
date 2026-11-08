# Operating modes and global settings

Date: 2026-11-08. Device identity: `FootCtrlPlus_016` (an identity string,
not an independently established firmware revision).

## Why this experiment exists

The beta.4 application decoded Advanced assignments and selected raw mode 3
when writing them. Its setup did not let a musician choose the controller's
operating mode. Reading a controller in fixed Program Change mode therefore
produced a warning instead of a complete setup decision.

The replacement must retain the mode that was read, expose an explicit mode
choice, and edit only the settings belonging to that choice. A mode change is
part of the reviewed device configuration, never a hidden side effect of saving.

## Independent sources

The installed CubeSuite executable and its own Qt bindings establish the mode
IDs below. The executable hash, symbol addresses, layout and scalar write
footprints are documented in [MAPPING.md](../../packages/chocolate-layout/MAPPING.md).
No community implementation or offset table was used.

| Stored value | CubeSuite label |
| ---: | --- |
| 0 | Program change A |
| 1 | Program change B |
| 2 | Custom mode |
| 3 | Advanced custom mode |
| 4 | Manufacturer control |
| 5 | Touch screen (Android) |
| 6 | Video Model |
| 7 | Keyboard A |
| 8 | Keyboard B |
| 9 | MultiMedia keyboard |
| 10 | Custom keyboard mode |
| 11 | Mix key |
| 12 | Speaker mode |

Program Change B is the vendor's label for the sequential **CC** mode; it
must not be described as another arbitrary PC assignment editor.

The [stored manuals](../manuals/README.md) describe different software revisions.
Their one-based mode numbers are not stored IDs. In particular, the separately
documented Advanced Custom Mode 2 with sixteen groups is not evidence for a
new mode ID or storage extent in this installed application.

## Hardware procedure and result

1. Read all 23,646 configuration bytes through the independently implemented
   native MIDI transport. Require exact equality with the retained original.
2. Write byte zero with each value 0 through 12, using CubeSuite's observed
   one-byte mode write footprint. Require a successful acknowledgement.
3. After each write, read the complete image and require equality with the
   expected original image with only that mode byte changed.
4. Restore the original mode and require exact equality of the complete image.

All thirteen values passed. No other byte changed. The original was restored.

A second experiment changed each of the following twenty scalar fields
individually, read the complete expected image, restored the field, and again
read the complete original image:

- Interface type and global MIDI channel.
- Custom A/B/C/D command selectors and their four associated flags.
- Interface command selector.
- PC, CC and Advanced maximum-group indexes.
- Advanced, custom-keyboard and mixed selected-group indexes.
- Polarity, Bank MIDI and PC display flags.

All twenty passed. Offsets and allowed domains come from the own static mapping;
the experiments do not assign new meanings to unidentified flags or selectors.
Private original images and transport traces remain outside the public repository.

## Compiled library verification of the new editors

The actual TypeScript layout package and `ProtocolSession` were then compiled
from the implementation and exercised through the native MIDI transport. Before
any write, each generated image was compared with a separately constructed
expected image using the independently mapped byte coordinates.

| Case | Changes | Result |
| --- | ---: | --- |
| Custom keyboard: first A and last group/D, two shortcut combinations, mode 10 | 6 bytes | Exact full write/readback and restoration |
| Mixed: keyboard on A, navigation on B, MIDI tap/hold records at last group/D, mode 11 | 14 bytes | Exact full write/readback and restoration |
| Expression interface: first and last endpoint records, expression interface selection | 9 bytes | Exact full write/readback and restoration |

The writer used the observed CubeSuite send ranges, preserving the unchanged
bytes within those ranges, and activated the mode after assignment data. Each
case started from and ended at the complete original image. The private harness
is `verify-modes-library.mjs`; its result is
`own-modes-typescript-001-summary.json`. No footswitch or expression pedal was
physically actuated during these storage experiments.

### Correction to the older Interface interpretation

The Interface bank has five-byte **endpoint records**, not the typed PC/CC
records used by Advanced and Mixed. Own inspection of `editInterface` at
`0x10008c8a0` identifies enabled, channel index, Data, Loosen Value and Step On
Value. The three data/value fields range from 0 to 127. A dedicated patch and
decoder now model these fields; the obsolete typed-message interface path is
rejected. The first/last endpoint case above verifies this corrected byte layout.

## Chrome wizard roundtrip

The real Web MIDI adapter was exercised from the localhost application in Chrome:

1. Select the confirmed SINCO input/output, qualify identity and read the complete
   original. The wizard correctly displays Program Change A as the current mode.
2. Explicitly choose Custom Keyboard, assign Ctrl+A to group 1/A and review both
   the mode transition and the named shortcut.
3. Save through the UI. The adapter acknowledges the write and compares the full
   readback before displaying configuration saved and checked.
4. Choose “Test later”; no physical-key result is claimed.
5. Restore the original raw backup through the UI and require verified readback.
6. Disconnect Chrome. An independent native read returns all 23,646 original
   bytes, mode 0, SHA-256
   `6d45d5b2655f363f892bda52bfd3ca56e5ae69188cba0bd29a110f5d13ed21b7`.

The modified image hash begins `c21210c4a194ece5`; the final read had zero
differences from the original. Private evidence includes
`modes-browser-write-verified.png` and `modes-final-independent.jsonl`.

## Limits of the evidence

These results establish byte storage, acknowledgement, exact readback and
restoration. They do not establish physical footswitch timing, emitted MIDI/HID,
destination behavior, Bluetooth operation, or persistence after power cycling.

The native accessibility radio-button action changed CubeSuite's selected visual
control without invoking its mode-write handler. A subsequent full hardware read
proved the mode had not changed. A selected radio button alone was therefore not
accepted as evidence of a device write. Mode labels were cross-checked through
the application's own bindings; storage was verified independently as above.
