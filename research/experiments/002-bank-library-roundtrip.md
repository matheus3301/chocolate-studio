# Advanced bank storage and actual-library qualification

Date: 2026-11-08 UTC. Same physical `FootCtrlPlus_016`, CubeSuite executable, configuration size and original backup as experiment 001.

The coordinator first generated a controlled image independently of the TypeScript implementation, then used the actual `@chocolate-studio/chocolate-layout` patch implementation to reproduce it. The two complete images matched byte for byte, with 20 changed offsets:

- Advanced mode 3.
- Group 1, switch A: alternating sequence mode; Bank A = PC 17, channel 5; Bank B = CC 69, value 127, channel 5.
- Group 8, switch D: short/long mode; Bank A = CC 32, value 2, channel 16 followed by PC 127, channel 16; Bank B = CC 64, value 0, channel 1.

The actual compiled `ProtocolSession`, connected through an independent native CoreMIDI transport, wrote and verified the complete advanced region (address `0x5d`, length `0x3420`, chunks no larger than 1,024 bytes), then changed the mode byte. A full configuration reread matched the expected image exactly. Restoring the advanced region and original mode produced the exact original full-image SHA-256 again.

The same actual-library runner independently queried device identity, read the whole configuration, wrote global channel 3, verified the full image, restored channel 1 and verified the original image.

Private reproducibility artifacts are retained by the coordinator: `verify-library.mjs`, `verify-library-banks.mjs`, `own-typescript-library-001.json`, `own-typescript-banks-001.json`, and the independent experiment's prepared/observed images. Personal baseline data and proprietary disassembly are not distributed. The repository's mapping document identifies each field's original derivation.

This qualifies the tested storage paths of the actual TypeScript library through the native transport. It is not physical-footpress verification, a power-cycle persistence test, or qualification of all firmware variants. Browser/Web MIDI is a separate integration gate. The release must state these limits.
