# 003 — Public-site Web MIDI roundtrip

Performed 2026-11-08 UTC through the deployed `0.1.0-beta.1` UI at
`https://chocolate-studio.mmonteiro.dev`, commit
`c1dc4e02c72b522a2e8a3790898a180fa781e1c6`.
The beta.2 release adds this evidence and licensing, without changing the
hardware adapter, protocol, layout or editor behavior.

## Environment and procedure

- macOS 26.6.2, Chrome 157.0.8103.38, physical Chocolate Plus identifying as
  `FootCtrlPlus_016`, explicitly selected SINCO input/output.
- Accepted Chrome's ordinary MIDI/SysEx permission prompt using computer use.
  No browser flags, profile changes or permission bypasses were required.
- Read the complete 23,646-byte image through Web MIDI and downloaded the FCP.
  Its SHA-256 matched the original CubeSuite backup.
- Reopened the editor after a stale local-draft conflict, reread the controller,
  and reviewed the eight-group read into a saved draft. No hardware write had
  occurred during that conflict.
- Edited group 1 / switch A: Bank A PC17 on channel 1; Bank B CC69=127 on
  channel 1; behavior Alternate A/B. All other groups/switches were retained.
- Reviewed the musical diff and seven-byte technical diff, including advanced
  mode activation. Applied through the UI and received full verified readback.
- Downloaded the resulting FCP and independently compared both exported files.
  Exactly the seven reviewed positions differed; every other byte was equal.
- Restored the original device backup through the UI. The new full read matched
  its SHA-256. Disconnected the browser, then performed an independent read-only
  native pass with the actual TypeScript library; it also matched all original
  bytes. The controller was left in its original configuration.

## Observed changes

| Decimal offset | Before | After | Meaning |
| --- | --- | --- | --- |
| 0 | 00 | 03 | Advanced mode |
| 93 | 00 | 01 | Alternate A/B |
| 97 | 00 | 11 | Bank A PC17 |
| 174 | 00 | 01 | Bank B first record enabled |
| 176 | 00 | 01 | Bank B CC type |
| 177 | 00 | 45 | CC69 |
| 178 | 00 | 7f | Value127 |

Original and restored SHA-256:
`6d45d5b2655f363f892bda52bfd3ca56e5ae69188cba0bd29a110f5d13ed21b7`.

Modified SHA-256:
`32edfd8d23ac2c8567b7c17b7567fbc2b9cb8055890bbe392023b944734c09c6`.

Complete personal images and raw captures remain outside this repository.
This qualifies browser storage read/write/readback/restoration on this observed
identity. It does not qualify physical footswitch output, power-cycle
persistence, other firmware, Bluetooth or routing to external effects units.
The identity suffix is not a verified firmware version. No factory reset or
firmware flashing was attempted.
