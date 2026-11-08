# First independent hardware roundtrip

Date: 2026-11-08 UTC. Target: M-VAVE Chocolate Plus reporting `FootCtrlPlus_016` over the SINCO CoreMIDI input/output pair on macOS 26.6.2.

## Provenance

The installed CubeSuite executable preserves C++ symbols. Its SHA-256 is `1730799b103cb3c029ca9d1999e7355e20342f5a99d338cca963cf127140c88f`. We derived packet framing from `u8ToMidi`, `CUSBConnect::make_flash_read_packet`, `make_flash_write_packet`, and `add_checksum`, and the configuration address/size from `FootCtrlPlusDlg::initDataByUSB`. No community implementation was used. Proprietary binaries/disassembly and complete personal configuration captures are excluded from this repository.

An independently written CoreMIDI sender transmitted the derived requests. A separate input listener recorded replies. This is an active request/response experiment, not a claim that CubeSuite output was intercepted. Snoize's outgoing spy driver was unavailable in this session.

## Observations

1. Read flash type 4, address 0, length 23,646 in sequential chunks of at most 1,024 bytes. Every response passed framing, length, body-checksum, address, flash-type, and byte-count checks.
2. The resulting configuration matched the prior CubeSuite `.fcp` export exactly, SHA-256 `6d45d5b2655f363f892bda52bfd3ca56e5ae69188cba0bd29a110f5d13ed21b7`.
3. Write configuration offset 2 from 0 to 1 (global MIDI channel 1 to 2, established by the channel controls' code). Receive successful ACK, then reread all 23,646 bytes. Exactly offset 2 changed.
4. Write offset 2 back to 0, receive successful ACK, and reread the complete configuration. It exactly matched the original hash again.

The small, non-personal request/ACK fixture is in `../fixtures/channel-roundtrip.json`. It is observed evidence, not a synthetic mock. Full private logs retain timestamps and raw/decoded packets for coordinator review.

## Qualified scope

This experiment validates the observed device's packet encoding/checksum, complete configuration reading, one-byte write, successful ACK decoding, reread verification, and restoration of that field. It does not establish every mode's semantics, physical footswitch output, power-cycle persistence, all firmware versions, or factory-reset support. Later experiments must qualify the bank editor and browser adapter separately.

Writes must preserve unknown bytes, serialize requests, retain a baseline backup, and verify readback. An ACK alone is not verification. No automatic retry of an ambiguous write is justified by this experiment.
