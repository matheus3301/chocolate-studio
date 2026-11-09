# Direct editor browser roundtrip — 007

Date: 2026-11-09. Coordinator-controlled Chrome on macOS, local application
`http://127.0.0.1:5173/`, physical USB device identifying as `FootCtrlPlus_016`.
The suffix is not a firmware-version assertion. No firmware update or factory reset.

## Procedure and observations

1. Open the new app with an existing Web MIDI permission. The unambiguous SINCO
   pair was discovered, protocol identity qualified and configuration read. The
   editor opened automatically in PC mode; no manual port checkbox or Continue.
2. Independently read the entire configuration through the native transport.
   It matched the original private baseline: 23,646 bytes, SHA-256
   `6d45d5b2655f363f892bda52bfd3ca56e5ae69188cba0bd29a110f5d13ed21b7`.
3. Open controller channel/display/navigation options; set MIDI channel 1→2.
   Optional View changes showed exactly one changed byte and channel 1→2.
   Save to Chocolate completed with the fully verified status. Restore channel1
   through the same controls and save. Independent full read matched baseline.
4. Choose Custom MIDI actions while the controller remained in PC mode. Saving
   opened a concrete whole-controller mode review, PC→Advanced, one byte, no
   musical action changes. Explicitly save; full readback completed.
5. Choose PC mode again, review and save. A final independent native read again
   matched the original configuration exactly.

## Boundaries

This qualifies the new browser connection/adoption and ordinary/mode-change save
paths against real hardware, plus exact restoration. It does not establish
physical footpress emission, sound, Bluetooth compatibility, power-cycle
retention, or cross-platform port naming. Those are distinct from stored-byte
verification. The prior protocol/layout qualification remains in experiments
001–006. Raw configuration and native traces are private and excluded from Git.
