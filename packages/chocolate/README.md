# Chocolate library

`@chocolate-studio/chocolate`: independently written strict TypeScript; no runtime dependencies, DOM types, storage, translations or UI. Runtime requirement: `Promise.withResolvers` (ES2024).

## API

- Root: strict byte/hex utilities, transactional `ByteReader`, immutable `BinarySnapshot`, half-open positional `diffSnapshots`, immutable trace frames, transport/clock interfaces, portable cancellation, `Session` and structured error codes/data.
- `/testing`: deterministic `FakeTransport` with manually completed/failed sends, incoming frames and disconnect.
- `/protocol`: MIDI bit packing, strict packet/read-response/ACK codecs, bounded streaming SysEx decoder, `ProtocolSession`, opaque `ConfigurationDraft` and evidence metadata.

`readConfiguration()` reads all 23,646 bytes from flash type 4/address 0, sequential chunks ≤1,024. `read(address, length)` returns `{ state: 'read', address, snapshot }`. `writeAndVerify(address, bytes)` requires each chunk's ACK before the next, returning `{ state: 'verified', ... }` only after exact readback. Draft channel storage is 0..15; UI displays 1..16. Only offset 2 is editable; all other bytes stay opaque.

`transact(request, matcher)` subscribes before sending; matcher sees validated packets. Incoming frames are bounded to 2,048 bytes. Caller owns explicit port selection. No discovery, erase, reset, firmware, retry or browser adapter.

## Lifecycle and safety

Overlapping protocol transactions reject `BUSY`. Standalone `Session` permits one send and one receive waiter; unmatched input is not buffered. After an ambiguous timeout/cancellation, `ProtocolSession` becomes permanently desynchronized: late replies cannot satisfy a subsequent request. There is no automatic recovery; a new wrapper around an active old connection is not a safe new transport boundary.

Cancellation is local and cannot retract sent bytes or undo writes. Physical sends remain busy until their underlying promise settles, even after cancellation. Disconnect is terminal. `dispose()` detaches subscriptions without closing externally owned ports. Timeouts are per chunk (read 2s, ACK 10s unless overridden), not whole-transfer deadlines.

Draft, read and verified results remain distinct. Failed transfers may leave partial device changes; retain a baseline and use demonstrated recovery. Send completion and ACK alone never verify hardware state. ACKs contain no transaction/address ID: use exclusive port ownership and no concurrent sessions. Snapshots isolate mutable buffers; diffs are positional ranges, not insertion-aware edits.

## Evidence boundary

Behavioral tests cover malformed/truncated input, isolation, diffs, cancellation/timeouts/disconnect/late completion, reviewed observed request/ACK vectors, complete synthetic reads, matching, ACK sequencing, rejection and readback mismatch. An actual-package smoke exercises write → ACK → readback using fake transport.

Coordinator's independent native codec—not this TypeScript implementation—has hardware evidence for full read, channel-byte write, ACK, reread and restoration on `FootCtrlPlus_016`. `candidateEvidence.libraryHardwareQualified` remains false until coordinator exercises this library. Public evidence is integrated separately: `research/experiments/001-hardware-roundtrip.md` and `research/fixtures/channel-roundtrip.json`. No community protocol implementation/tables or private captures were copied.

Banks, other field layouts, physical output, power-cycle persistence, other firmware and factory reset remain unqualified/unsupported.

## Checks and integration

```sh
pnpm --filter @chocolate-studio/chocolate typecheck
pnpm --filter @chocolate-studio/chocolate test
```

Root supplies TypeScript/Vitest. Application owners add `@chocolate-studio/chocolate: workspace:*` themselves. No root package/lock edits are included.
