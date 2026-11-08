# Protocol software foundation

Independent implementation; no community protocol source/tables consulted. No worker hardware, desktop or MIDI access. All binary test data is synthetic except the coordinator-reviewed, nonpersonal request/ACK vectors cited in codec tests. Private captures/disassembly and personal configuration are not product assets.

## Verified software

Strict input bytes/hex and transactional bounded reads; immutable opaque snapshots and positional changed ranges; immutable direction/timestamp trace frames; DOM-independent transport, cancellation and clock contracts; deterministic fake transport; terminal disconnect, local timeout/cancellation, late completion isolation and cleanup.

Protocol codecs derive from our own CubeSuite analysis (binary SHA-256 `1730799b103cb3c029ca9d1999e7355e20342f5a99d338cca963cf127140c88f`): continuous LSB-first 8-to-7-bit packing with F0/F7 framing; inner header `00 59`, command, 24-bit little-endian body length, opaque body, one's-complement body-sum checksum. Strict decoders validate framing, padding, exact lengths, checksum and read payload length before exposing bytes. The checksum is not a CRC.

Read command 23h and write command 22h use flash type, unsigned 32-bit little-endian address and 24-bit little-endian count. Read replies add data; ACK command 00h has one status byte (00 success). No ACK transaction/address IDs were found. Session subscribes before send, matches read type/address/count, serializes whole operations, chunks at 1,024, and requires exact readback after writes. Failed ambiguous transactions poison the session rather than retrying or accepting stale replies.

The configuration is 23,646 opaque bytes at flash type 4/address 0. Only the evidenced channel byte at offset 2 has a public draft-editing API; other data remains preserved and uninterpreted. Native CoreMIDI raw relay compiles and its offline synthetic logger was exercised, including 300-byte packets and both directions; actual routing remains a coordinator validation concern.

## Qualification boundary

Coordinator reports their separate native codec read the complete device configuration, changed channel 0→1, received ACK, reread with only offset 2 changed, restored 0, and reread the exact baseline. Reviewed observed request/ACK vectors are tested byte-for-byte here. The TypeScript library itself remains `libraryHardwareQualified: false` until coordinator exercises this implementation through a real transport. Further independent bank-region writes do not automatically qualify any unimplemented layout API.

No physical footswitch output, power-cycle persistence, other firmware, factory reset or generalized recovery is claimed. ACK is not verified state; cancellation cannot retract a send. Capture/logging and hardware qualification belong to coordinator. Browser transport/UI adapter integration belongs to coordinator; protocol core has no DOM, storage or localization dependency.

Package API and lifecycle contracts: `packages/chocolate/README.md`. Checks: package TypeScript source/test compilation, Vitest behavioral suite and actual-package fake-transport smoke. Official API documentation consulted: [Vitest timers](https://vitest.dev/api/vi.html#vi-usefaketimers), [Promise.withResolvers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers), and Apple CoreMIDI documentation listed in `research/tools/README.md`.
