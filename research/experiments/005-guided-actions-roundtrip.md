# Guided actions: browser write/readback/restore

Date: 2026-11-08. Controller identity: `FootCtrlPlus_016`. Firmware version remains unknown.

This experiment used our own browser adapter and protocol, through Chrome Web MIDI with SysEx, on the local application. It used no community protocol implementation or copied configuration fixture.

## Procedure and observed result

1. Read the complete 23,646-byte image through the connection wizard. The original backup was persisted and checked before write controls became available.
2. Independently inspect CubeSuite: Program change A was selected, MaxGroupCount displayed 127 and Pcdisplay was unchecked. In this image raw mode byte 0 corresponds to Program change A. This observation does not establish a general editable-slot count or physical display telemetry.
3. Adopt the read, choose the M5 profile/channel 1, and assign A tap to Select preset 1 and A hold to Select preset 2. The domain produced PC0/PC1 with `shortLong`, preserving other buttons/groups and opaque bytes.
4. Review the physical slot comparison and explicit activation of the observed Advanced layout. Apply through the web interface. The success screen reported the completed write and full reread and then asked for a separate physical equipment test. “Test later” was chosen; no physical-success confirmation was fabricated.
5. Restore the original complete backup from the web interface. The adapter completed restoration and full reread. Disconnect the browser session.
6. Perform an independent read-only CoreMIDI request: 23,646 bytes, raw mode 0, SHA-256 `6d45d5b2655f363f892bda52bfd3ca56e5ae69188cba0bd29a110f5d13ed21b7`, matching the original exactly.

An earlier development pass was followed by a hot reload before its success screen was inspected. It was restored and the final pass above was repeated with stable application sources. No firmware update or factory reset was used.

## Software checks

The profile-driven editor was exercised in Portuguese and English. A saved/exported JSON v2 project retained both action bindings and exact raw PC0/PC1 fallback. Automated tests cover fresh-read reconciliation against saved metadata, stale-binding removal, unknown profile versions, selected-sequence preservation, backup failures/download acknowledgement, disconnects and late previews. A second synthetic profile proves different action parameters and mappings without brand branches in the UI.

## Limits

This establishes configuration storage, exact readback and restoration on this unit. It does not establish footpress timing/exclusivity, the M5's physical response, E/F navigation in Advanced mode, Bluetooth or persistence after a power cycle. The fixed PC000–127 mode remains distinct from the eight-group Advanced layout we have mapped.

Private original images, raw device traces and desktop screenshots are retained outside the public repository. Published evidence contains the procedure and hashes only.
