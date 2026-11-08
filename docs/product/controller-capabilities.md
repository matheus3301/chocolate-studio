# Controller capabilities for the guided product

**Historical discovery document, based on beta.3.** The user subsequently authorized implementation. The current mode-aware setup contract is [Operating-mode setup](operating-modes.md); implementation and hardware evidence are recorded in [release qualification](../release-qualification.md). The analysis below preserves the original evidence boundaries and is not the current release inventory.

## 1. Product rule: configure a request, do not invent an outcome

Offer only the intersection of **controller identity/layout + executable mode/gesture + exact destination model's documented command + usable route/channel**. A catalog name cannot add a missing controller capability.

| Evidence | Permitted claim | Not established |
| --- | --- | --- |
| Manufacturer manual | “Documented for this model/revision” | Applicability to every connected controller revision |
| Own static/storage observation | Fields and commands have an evidenced representation | Actual footpress event ordering or timing |
| Write plus exact reread | “Configuration written and reread” | Destination received it, changed sound or persisted after restart |
| Captured physical event | Specified foot action emitted specified bytes on that route | Destination acted unless separately observed |
| Destination observation | Intended action was confirmed in the tested setup | Continuous live feedback or universal firmware support |

[Experiments 001–003](../../research/experiments/) qualify complete configuration read/write/readback/restoration, including actual TypeScript and Chrome Web MIDI, on `FootCtrlPlus_016`. They explicitly do **not** qualify physical footswitch output, hold timing, M5 execution or power-cycle persistence. `016` is not a verified firmware version. No reset/flashing capability follows from this evidence.

## 2. Beginner wizard → physical editor

1. **Conectar Chocolate / Connect Chocolate.** Explain cable/mode briefly; request ordinary MIDI/SysEx permission; require explicit input/output confirmation. No silent port pairing, configuration write or entry dashboard. Unsupported browser/permission failures get actionable help.
2. **Verificar comunicação e ler / Check communication and read.** Verify identity, complete the full read and retain the original raw backup. Open port ≠ communicating controller; communicating controller ≠ read configuration. Unknown identity/read failure cannot advance as success. Unknown configuration can remain available for backup/export without becoming editable.
3. **O que você quer controlar? / What will you control?** Start with **Line 6 M5**, plus **Advanced: generic PC/CC**. TONEX is later: require the exact model; `TONEX ONE+` must not be substituted with `TONEX ONE` or another family member. Unavailable templates are explanations, not working choices. Selecting M5 is user intent, not M5 detection.
4. Ask the M5 receiving channel and physical route. Its manual documents channels 1–16/Omni, default 1. A USB programming connection to Chocolate does not prove a working destination route; do not guess host/TRS/Bluetooth compatibility.
5. Show the physical A–D controller with one selected switch, readable musical assignments and gesture controls: **Tocar / Tap**, **Segurar / Hold**. Start with “Carregar preset 01 / Load preset 01”, not PC/CC fields. Selecting the diagram edits intent; it does not send MIDI or simulate a real press. The drawn display means **editing selection**, not live device/destination state.
6. Review musical changes, any global mode activation and backup; explicitly **Gravar no Chocolate / Write to Chocolate**. Report **Configuração gravada e relida / Configuration written and reread**. A separate physical check can then confirm the destination action; do not report “M5 preset loaded” from storage alone.

Keep offline import/export accessible as a secondary path. Keyboard operation, visible focus, ≥44px switch targets, labels outside the chassis, non-colour-only state, announced progress/errors and equivalent PT-BR/EN recovery text are acceptance requirements. Technical logs/raw diffs belong behind details, not on entry. Preserve edits through errors.

## 3. Controls, sequences and groups: never conflate them

| Term | Meaning / UX decision |
| --- | --- |
| Physical A/B/C/D | Four switches and four editable layout IDs |
| E / F | E = simultaneous A+B; F = simultaneous C+D. Not fifth/sixth programmable switches. No editable or disabled-placeholder E/F cards |
| Primary / secondary | Two event sequences **inside each physical switch**, currently legacy “Bank A / Bank B”. Prefer qualified event labels such as “On tap / On hold” |
| Configuration group | One of eight mapped sets of A–D assignments; selecting an editor group is not evidence of physical navigation |
| Destination preset / MIDI bank | Target preset numbering and optional CC0/CC32 selection; neither is a Chocolate sequence or E/F group |

### E/F banking is mode- and manual-dependent

- **User Manual `26.1.8`, PDF pp.1–4:** panel combinations; E/F group switching in PC/CC modes; Advanced Custom Mode has **at most eight groups and no E/F BANK switching**.
- **Software Instructions, PDF pp.2, 4–7:** Advanced Custom Mode **1** has no E/F banking; a distinct Advanced Custom Mode **2** has short/long behavior, **up to sixteen groups**, and E/F banking. Chinese descriptions corroborate the split (PDF pp.19–21).
- Mode numbering and keyboard group counts also differ. Manual display “Mode 4” is not raw stored value 4. Current own layout maps **raw mode 3 / eight groups**; do not guess another raw mode or a sixteen-group layout.

**Decision:** no unconditional live next/previous controls or sixteen-group promise. For current Advanced, group selection is editor selection, not E/F navigation. To add banking, coordinator must establish applicable identity/mode/layout, own storage/write/restore evidence, and physical E/F direction, limits/wrap, simultaneity tolerance, constituent-switch leakage, display/group result and any emitted MIDI. Do not invent navigation commands or a live bank indicator where no feedback exists. Non-interactive combination explanations are appropriate.

## 4. Gesture semantics and current schema limits

Manual descriptions below are **not** physical-event results. Static mode labels/bytes are evidenced; exact event-to-sequence execution remains a separate gate.

| `behavior` / stored mode | Manufacturer description | Product consequence |
| --- | --- | --- |
| `single` / 0 | Same information on each short tap | One tap action; retain hidden secondary bytes without claiming they execute |
| `alternate` / 1 | Successive taps alternate two information sets | “First / next”; not feedback about target on/off state |
| `momentary` / 2 | Different information on press and release | “On press / on release”; not tap/hold |
| `long` / 3 | Same information on long presses | Long-only; qualify participating sequence and timing rather than infer them from its name |
| `shortLong` / 4 | Different information on short tap and long press | Proposed primary = tap, secondary = hold; qualify ordering, suppression and release behavior |

Sources: user manual PDF p.4, software instructions PDF p.5 and [own layout mapping](../../packages/chocolate-layout/MAPPING.md). No dependable numeric hold threshold or repeat cadence is established.

**Actual bridge:** generic `StudioConfiguration` accepts `press`, `release`, `longPress`, `doublePress` and four actions/switch. Hardware mapping accepts **at most one `press` action plus `secondaryMessages`**; other actions reject the whole plan (`hardware.useTwoSequences`). Thus hold in the required example uses `behavior: 'shortLong'` and `secondaryMessages`, **not a second `longPress` action**. Here `press` is the legacy primary-sequence carrier, not proof that a short action fires at button-down. Both sequences remain stored; behavior changes can activate hidden commands and must preview that risk.

### Tuner, tempo and alternate-state caveats

- **Tap tempo:** M5 documents CC64 values 64–127; canonical event 127. Do not add an undocumented CC64=0 reset/release. A tap/hold recognizer may defer a tap until release or hold disambiguation, causing variable tempo jitter; a hold might emit an unwanted tap. Prefer a dedicated, physically qualified single-tap assignment. No BPM scheduler, delays or MIDI-clock generator exists in this bridge.
- **Tuner on hold:** M5 CC69 127 enters, 0 exits. Prefer explicit enter/exit actions and a clear exit path. Its own local TAP-button hold behavior does not establish Chocolate's threshold. Qualify threshold/release firing, repeat and suppression before combining tap tempo with tuner hold. Press/release “tuner while held” is not latched tuner behavior.
- **Alternate/toggle drift:** another sender, target controls/preset changes, missed MIDI, restart or mode change can desynchronize the next sequence and destination state. Prefer idempotent effect on/bypass or tuner enter/exit. Do not infer an ON lamp or “currently selected preset” from last-sent commands. Otherwise label alternating commands with target state unknown; qualify initial/reset phase.

## 5. Required example: tap A → M5 preset 01; hold A → preset 02

**Documented destination + proposed gesture binding + checked storage mapping; not a physically performed M5 result.** M5 Pilot's Guide Rev A PDF p.8 states PC0–23 → displayed presets01–24. Therefore use **PC0 / PC1**, not PC1 / PC2. No bank-select messages are required.

For receiving channel 1, this fragment belongs at `groups[0].switches.A`:

```json
{
  "label": "M5 presets 01 / 02",
  "behavior": "shortLong",
  "actions": [{ "gesture": "press", "messages": [
    { "type": "pc", "channel": 1, "program": 0, "destinationId": "m5" }
  ] }],
  "secondaryMessages": [
    { "type": "pc", "channel": 1, "program": 1, "destinationId": "m5" }
  ]
}
```

Add destination metadata `{ "id": "m5", "name": "Line 6 M5", "channel": 1 }` without replacing the existing project. Materialize the chosen channel into **each message**: destination IDs/default channels are metadata, not port routing or automatic rewriting of existing messages.

Structural offsets, from our own layout (`g` and `s` zero-based, A=0..D=3): `S = 0x5d + g*0x684 + s*0x1a1`. For group 1 / physical A:

| Location | Intended bytes / meaning |
| --- | --- |
| `0x0000` | `03`, global Advanced activation if needed; explicit reviewed change |
| `0x005d` / decimal93 | `04`, switch `shortLong` mode |
| `0x005e` / decimal94 | Primary slot0: `01 00 00 00 xx` — enabled, channel index0, PC type0, program0, preserved PC spare byte |
| `0x00ae` / decimal174 | Secondary slot0: `01 00 00 01 yy` — same fields, program1, independently preserved spare |

For channel `c` in 1–16, record channel = `c-1`. Expected destination messages are `[0xC0 | (c-1), 0]` and `[0xC0 | (c-1), 1]`. These are **expected PC output**, not captured footpress bytes or the configuration SysEx packets.

Pure in-memory execution of the actual beta.3 mapper on a synthetic valid image already in mode3 changed only decimal offsets **93, 94, 174, 177**. Artificial PC spare bytes `a5`/`5a` and opaque sentinels were preserved. Modeling hold as a second `longPress` action rejected the entire plan unchanged. This proves software representation only. Actual changed-byte counts depend on the retained image and surplus messages; do not promise four changes universally. No personal image was used.

Preserve B/C/D, all other groups and opaque bytes. A deliberate changed sequence clears surplus enabled records by their enable byte, not by zeroing trailing data. Unrecognized active records block replacing their bank. The current adapter writes/verifies a changed complete advanced region in ≤1024-byte chunks, applies other changed fields, activates global mode last, then checks a full reread. Storage qualification in experiments002/003 is not qualification of this exact musical example.

## 6. Safe bounds and untrusted imports

| Boundary | Enforce / preserve |
| --- | --- |
| MIDI | Integer channel1–16; PC/CC data0–127; stored channel0–15 |
| Destination | M5 picker01–24 only, despite generic PC0–127. Never guess additional parameter CCs |
| Controller | Eight groups, four switches, two sequences, sixteen **expanded records** per sequence |
| Generic project | 64 groups / four actions / 32 messages do not imply controller support; no silent truncation to 8/1/16 |
| Bank-select expansion | Requested CC0, CC32, PC in that order; both selectors plus PC consume three records. No automatic extras for M5 |
| Global channel | Offset2 range0–15 is storage-qualified, but does not replace per-record Advanced channels |
| Unknown data | PC/CC edits only; preserve note/custom/SysEx records, keyboard/mixed/custom areas, byte11, inactive trailing bytes and unused PC byte |

Current `configurationFromBytes` can warn and display fallbacks; these are not repairs. `configurationToBytes` rejects the complete write plan if `decodeFcp().issues` is nonempty. An unchanged bank with opaque active records can stay intact; attempting to change it rejects `hardware.preserveUnknownBank`. Show “contains commands this editor cannot change”, not “empty”. Templates patch a fresh retained full image, never regenerate from partial JSON or a blank M5 project.

Keep two file concepts distinct:

- **Project JSON:** validated version/size/structure, local labels/destinations/presets, reviewed replacement with backup of the previous draft. Valid offline additional gestures can still be unprogrammable; preserve and explain, do not drop/convert silently.
- **Raw FCP:** 23,646 bytes, no known embedded model/firmware signature. Imported-file restore requires the already qualified connected controller, size/hash and structural validation, plus explicit confirmation. Hash proves integrity, not provenance. A full restore intentionally replaces current opaque bytes with the file's bytes; a partial template edit must preserve the current image instead.

Labels and preset/destination names are local metadata, not strings written to Chocolate or fetched M5 preset names. Local project save/backup is not device programming or a complete-device backup.

## 7. Honest state machine and backup requirement

Recommended visible sequence:

**Offline → explicit ports → checking identity → connected/not read → complete read + original backup → local draft → reviewed preview → applying → controller bytes verified.** Destination confirmation is a separate later result, not a rename of the last state.

The adapter reuses `status: connected` after connection/read/write. The wizard must also inspect session provenance and `observed`/`verified`; status alone does not establish a read or match to the current draft. Requirements:

- Preview is bound to an owned plan, exact full baseline/hash and connection epoch. Any draft edit invalidates the UI's approval; new read/disconnect/port changes invalidate stale plans.
- Before writing, a fresh full read must equal the preview baseline. Serialize writes/ACKs; full final read must equal the intended image. ACK alone is not verification. Another application/tab can still alter hardware: this is not a device-wide lock.
- `acceptRead` retains the first session baseline; reread does not replace that original, and ordinary read clears `verified`. Disconnect clears adapter observed/verified/baseline state. Persist/export the original **before the first modification**; session memory is not durable recovery. Handle failed IndexedDB persistence with an explicit downloaded-backup decision.
- Error/disconnect must clear live confidence and preview while preserving local draft and persistent/exported backup. Partial changes may exist. Reconnect/reread and review a new comparison; no automatic ambiguous retry, rollback or guessed factory reset. Explicit backup restore also requires exact full reread.

## 8. Extensible musical-action catalog, not executable plug-ins

Future **data files** should carry stable profile/action IDs, exact model, PT-BR/EN label/help keys, display numbering, typed parameter bounds, ordered PC/CC expansion, channel materialization, controller gesture/mode/record budget, idempotent/stateful and timing assumptions, and per-feature evidence (manual revision/page/hash; storage; physical output; destination test). Validate the expanded intersection atomically. No arbitrary code, raw programming commands or remote execution in a profile.

Initial M5 vocabulary, Pilot's Guide Rev A PDF pp.7–8:

| Musical action | Exact documented command | Qualification limit |
| --- | --- | --- |
| Load preset01–24 | PC = displayed preset − 1, range0–23 | Short/hold storage mapping is not physical execution |
| Effect bypass / on | CC11 = 0 / 127; ranges0–63 / 64–127 | Explicit requests, no target feedback |
| Tuner exit / enter | CC69 = 0 / 127; ranges0–63 / 64–127 | Clear exit and gesture/timing gate |
| Tap tempo | CC64=127; permitted64–127 | One event per qualified tap, not BPM or clock generation |
| Expression | CC1 0–127; assignments per M5 preset | No qualified continuous-controller route here; not a working continuous-expression template |
| Clock sync | Incoming MIDI Beat Clock | Not expressible by this PC/CC-only bridge; unavailable as executable template |

Do not invent effect-specific parameter CCs or preset sounds/names. TONEX requires exact-model official sources and separate routing/applicability evidence; generic Advanced is an expert raw PC/CC path, not a verified TONEX profile.

Current strict JSONv1 has no catalog-binding fields. Review an explicit schema/migration or versioned sidecar contract before persisting/exporting profile IDs: never append rejected keys or silently lose bindings. Existing v1 imports and ordered messages must survive; choosing/removing a template causes no hardware write.

## 9. Acceptance gates and unresolved risks

| Gate | Required evidence / decision |
| --- | --- |
| Design approval | User reviews wizard, physical A–D editor, mode-dependent E/F policy, catalog and status wording **before application edits**. Prototype connection/write states stay explicitly simulated |
| Planning correctness | Preset01→PC0 and24→PC23; channels1/16; shortLong schema bridge; expanded16-record limit; unsupported gestures/unknown fields reject atomically; opaque bytes and project/catalog import/export survive |
| Safe programming | Guided flow retains complete original backup, reviewed mode activation, fresh-baseline conflict check, serialized ACKs/readbacks and full final comparison; stale draft/disconnect/storage failure never becomes success |
| Required physical example | Coordinator captures actual A tap/hold output on the destination route, observes M5 presets01/02, tests repeated quick taps/hold/release with no unintended event, records timing and restores/rereads original. No numeric threshold invented |
| Timing/stateful actions | Qualify tempo jitter, hold suppression/repeat/release, tuner exit, alternate initial/reset phase and externally changed target state before novice compositions |
| E/F / other mode | Resolve manual/identity/layout variant and physical navigation limits/wrap/leakage before live next/previous. Editor selection and a sixteen-group manual are insufficient |
| Accessible PT/EN | A novice can complete connect→read→M5→tap/hold→review→write/readback→physical confirmation without PC/CC expertise, using keyboard/assistive technology and narrow layouts |

**Recommendation:** documented templates may be planned/reviewed before physical qualification, with evidence level visible. Do not enable the novice promise “tap A / hold A controls M5” until the required physical example passes. Existing qualified raw storage/Advanced tools are not destination-execution certification. Power-cycle persistence is a separate future test; reset/firmware operations are excluded.

Highest risks: conflicting manual variants; unmeasured short/long execution; preset indexing and channel errors; activating hidden sequences; unknown-import normalization; losing opaque data/original backup; and presenting editor/last-command/storage state as a successful musical action.

### Audit sources

- [Manual provenance and source hashes](../../research/manuals/README.md): Chocolate User Manual `26.1.8` pp.1–4; Software Instructions pp.2,4–7,19–21; Line6 M5 Pilot's Guide RevA pp.7–8. Third-party reference documents, not web assets or copied protocol code.
- `packages/chocolate-layout/src/{layout,decode,patch}.ts` and [MAPPING.md](../../packages/chocolate-layout/MAPPING.md): actual limits, mode bytes, record addresses, issue reporting and atomic field footprints.
- `apps/web/src/hardware-mapping.ts`: actual primary/secondary bridge, expansion, opaque preservation and unsupported-plan rejection.
- `apps/web/src/hardware-browser.ts`, `hardware.ts`; `packages/chocolate/src/protocol-session.ts`: identity, preview/epoch, baseline, ACK/readback and restore boundaries.
- `packages/midi/src/{configuration,messages}.ts`; `apps/web/src/{storage,useStudio}.ts`; [release qualification](../release-qualification.md): intent bounds, local persistence and published evidence.

KB consulted read-only; no shared learning written. Public source/manual facts, not private dumps or community protocol definitions, support this document.
