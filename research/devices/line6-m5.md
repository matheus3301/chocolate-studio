# Line 6 M5 destination profile — design proposal

Status: product definition for review, not an implemented feature or hardware qualification. Exact destination model: **Line 6 M5 Stompbox Modeler**, ID `line6.m5`. Do not substitute an M9, M13, HX, POD, or TONEX model. No application, controller, or destination behavior changes are authorized by this document.

## Primary evidence

- **[M5 Pilot’s Handbook, Rev A, 40-00-0292](https://line6.com/data/6/0a060b316ac34f0593fa7e002/application/pdf/M5%20Pilot)**, original Line 6 PDF, 10 PDF pages. Preserved as `research/manuals/line6-m5-pilots-guide-rev-a.pdf` in the main checkout, manual inventory commit `b77133e`. SHA-256 `e4d03620ca9b9d697e95e0a163453744d5d7f6d7a63c18ba80977463e1f16536`. Page numbers below are **PDF pages**, not printed section numbers.
- [Official English Rev B](https://line6.com/data/6/0a00050e087966677bd670243/application/pdf/M5%20Pilot%27s%20Guide%20-%20English%20.pdf), consulted for corroboration. Its MIDI Control table agrees with Rev A. The proposed catalog pins Rev A, not an unspecified latest manual.
- **[Chocolate Plus User Manual 26.1.8](https://img1.wsimg.com/blobby/go/65f9cd9e-befb-4162-8b92-925533045e36/downloads/84a00f95-de78-441b-ab2f-017725a68e2f/Chocolate%20plus%20user%20manual26.1.8.pdf?ver=1776996614767)**: PDF p.1 identifies E=A+B and F=C+D; p.4 documents short/long behavior and advanced-mode limitations.
- **[Chocolate Plus Software Instructions](https://manualf.oss-cn-hongkong.aliyuncs.com/manual/CUBE-TURNER/Chocolate%20Plus-Software%20instructions.pdf)**: PDF pp.2,4,5,7 distinguish PC/CC modes, Advanced Custom Mode 1, its five behaviors, and Advanced Custom Mode 2. These editions must not be combined into one universal controller capability list.

Only manufacturer manuals supply destination commands here. No community implementation, proprietary assembly, or personal configuration is included.

## Complete documented MIDI control table

All five channel-voice functions below come from **Rev A PDF p.8, MIDI Control / MIDI Reference Tables**. The M5 can send/receive PC and CC on channels 1–16; Setup also offers receive Omni. The destination instance must still choose one explicit transmitting channel, 1–16. Omni is a receiver setting, not channel 0 or 17.

| Musical action / ação musical | Exact MIDI intent | Limits and interpretation |
| --- | --- | --- |
| Select preset / Selecionar preset | PC `presetNumber - 1` | Display 01–24 maps to PC 0–23. No bank-select prefix. PC 24–127 is outside the documented M5 preset range. |
| Tap tempo / Marcar tempo | CC64, value 127 | Documented accepted range is 64–127. One invocation is one tap, not a BPM-setting command. No CC64=0 release message is specified. |
| Turn effect off / Desligar efeito | CC11, value 0 | Bypass range 0–63. This does not choose True Bypass versus DSP Bypass; that is an M5 setup preference. |
| Turn effect on / Ligar efeito | CC11, value 127 | On range 64–127. Repeating this action requests On again; it does not toggle. |
| Set expression position / Definir posição de expressão | CC1, integer position 0–127 | Moves the preset’s already-assigned expression control. It is not an arbitrary parameter controller or MIDI-learn operation. |
| Exit tuner / Sair do afinador | CC69, value 0 | Exit range 0–63. Does not change the M5 tuner’s audio-mute preference. |
| Enter tuner / Entrar no afinador | CC69, value 127 | Enter range 64–127. Do not label this as a feedback-aware tuner toggle. |
| Sync to incoming MIDI clock / Sincronizar com MIDI clock recebido | **MIDI Beat Clock**, separate protocol | Tap-tempo-enabled effects automatically sync to incoming clock. Not PC, CC, a stored BPM byte, or a sequence of fabricated CC64 messages. This design has no assignable clock binding. |

The chosen 0/127 values are canonical members of documented ranges, not the only valid values. The profile has no learned toggle, hidden first-press state, note command, or invented per-parameter CC. For example, CC69=127 means **enter tuner on the M5**, not an unrelated device’s preset or snapshot operation.

## Setup, expression, and musical limits

**Channel** — Rev A PDF p.6, Additional Setup / MIDI: hold M5 TAP and press MODEL SELECT to open Setup; press MODEL SELECT to reach the second page; set the bottom-left parameter knob to the intended channel. Manufacturer default is channel 1; do not assume the owner’s unit still has that setting. Match the editor’s named destination channel. Avoid Omni when multiple destinations share a route unless the user intentionally wants every channel received.

**Expression endpoints** — Rev A PDF pp.7–8, Using an Expression Pedal: assignments are saved **per preset**. Connect a compatible expression pedal to the M5, put it at toe and set desired parameters, then move to heel and set the other values. Verify both endpoints locally. The manual describes a passive 10 kΩ mono linear pedal with a 1/4-inch mono cable, including the Line 6 EX-1 (Rear Connections). This is an analog expression connection, not a MIDI cable. CC1 subsequently controls that preset’s assigned expression position; the profile cannot create endpoint assignments or know their musical meaning. A fixed CC1 value can be assigned to a switch; continuous movement additionally requires a separately supported controller/input route. Do not claim 0 means “no gain” or 127 means “maximum delay”: endpoint sounds are user-defined. Parameters set to tap-tempo control are not affected by expression operation (Basic Operation / TAP).

**Tempo** — Basic Operation / TAP and PDF p.7 / Tempo: tap twice or more to establish tempo; the effect must use tap-tempo control. All delay effects, most modulation effects, and some filter effects support it. The M5’s local tempo setup is 30–240 BPM, selectable global or per preset. This is **not** a documented bound on received MIDI clock and does not define a CC for absolute BPM. Incoming clock is documented separately on p.8.

**Presets are existing slots, not audio patches** — There are 24 stored presets. The editor can name a reference and request a slot; it does not read/create its sound or safely infer factory names. Rev A PDF pp.5–6 describes local save/rename and Manual/Auto Save. Auto Save retains effect adjustments; Manual requires local save. A PC command is recall, not save. Explain this distinction before expression experiments that may alter the owner’s sound.

**Other local preferences** — True/DSP bypass (and delay/reverb trails), tuner mute/reference, gate threshold/decay, knob-relative mode, display contrast, and Load/Instant Preset are local features described in Basic Operation and Setup. No per-feature CC is supplied for them in the MIDI Reference Tables. Do not manufacture bindings for those features.

**SysEx** — Rev A PDF p.6 documents preset dump/restore with an external MIDI interface and a SysEx application: dump all 24 or current preset; a received single preset goes into the M5’s current location. It supplies no message layout here. M5 audio-preset SysEx is not Chocolate FCP or Studio project JSON, and is not supported by this proposed PC/CC catalog. Firmware update and factory reset are separate local/service procedures on p.7, not editor actions.

## Physical connection: never assume M5 USB

The M5 Rear Connections section documents MIDI **IN and OUT on DIN**, not a USB MIDI port. For incoming control, the electrical route must end at **M5 MIDI IN**. Keep the guitar/audio path separate from MIDI.

- Generic direct topology: a controller or qualified adapter’s **DIN MIDI OUT → 5-pin DIN MIDI cable → M5 MIDI IN**. Do not assume the Chocolate’s expression jack is DIN MIDI, that an arbitrary TRS cable works, or that a passive USB-to-DIN cable translates USB.
- Computer-mediated topology: controller → computer MIDI input; an **explicitly supported routing path** → USB MIDI interface → its DIN MIDI OUT → M5 MIDI IN. The USB connection belongs to the interface, not the M5. Merely choosing that interface in a setup form does not implement live routing.
- A return connection **M5 MIDI OUT → interface MIDI IN** is relevant to documented M5 SysEx backup or separately qualified observation. It is not needed for one-way PC/CC delivery and is not proof that the app can query current preset, effect state, or tuner state.
- Chocolate USB-host/device roles and H/U switch are controller-specific. M5 has no USB device endpoint to plug directly into its USB host port. Ask the user which actual adapter/cabling route exists; do not assert a direct Chocolate-to-M5 route from either device’s name.

The proposed profile records DIN input/output and `directUsbMidi: false`; it does not autodetect or establish a route. Connected/read Chocolate status must never be presented as “M5 connected” or “M5 responds.”

## Required novice example: tap A → preset 1; hold A → preset 2

Proposed data: [`line6-m5.json`](../templates/line6-m5.json) and [`line6-m5-tap-hold.template.json`](../templates/line6-m5-tap-hold.template.json).

1. **Connect Chocolate / Conectar Chocolate**: request normal connection permission, verify identity/communication, read configuration, preserve an exact original image. Show a short actionable error if any step fails; no technical dashboard on entry. Offer local import/edit without pretending a controller is connected.
2. **What will you control? / O que você quer controlar?** Select exact model **Line 6 M5**. TONEX is a later, separately evidenced exact-model profile, not a substitute. **Advanced / Avançado** remains generic PC/CC. Add a named physical destination instance, confirm its channel and actual DIN route. A proposed channel-1 default is editable, not detected truth.
3. **Focused controller editor**: choose physical A on the preserved horizontal A/B–display–C/D controller. Show **Short tap / Toque curto: M5 → Preset 1** and **Hold / Segurar: M5 → Preset 2**. MIDI details remain on demand: PC0 and PC1 on the instance’s channel, with no CC0/CC32 prefix. Preserve all other assignments and bytes.
4. The template requests controller behavior **`shortLong`**, primary sequence PC0, secondary sequence PC1. Short/hold recognition, exclusive dispatch, release timing, and any hold threshold belong to the controller adapter, **not the M5 profile**. Never synthesize short+long behavior by sending PC0 immediately and PC1 later without qualifying whether the unwanted preset-1 change occurs on a hold. No hold duration is documented here.
5. If that exact controller/mode/firmware capability is not qualified, keep the template as a draft and explain the missing capability. Storage readback of the two banks is not a physical short/hold test. Do not silently downgrade to alternating presses, overwrite another controller mode, or claim the required example works physically.
6. Review human-readable differences, then explicitly apply and read back. Separate **Draft / Rascunho**, **Configuration read / Configuração lida**, **Stored configuration verified / Configuração gravada e conferida**, and **Destination response not tested / Resposta do destino não testada**. Ask for the owner’s actual short tap and hold observation before recording an M5-response result. A readback match alone never becomes that result.

E=A+B and F=C+D are physical combinations, not extra editable switches. Manuals differ: Software Instructions p.2 permits group changes in PC/CC modes; p.4 excludes E/F bank changes in Advanced Custom Mode 1; p.7 describes a different Advanced Custom Mode 2 with group changes. User Manual 26.1.8 p.4 describes up to eight advanced groups and excludes E/F bank changes. Do not label E/F as universal previous/next bank or expose editable E/F placeholders. Do not equate controller group/bank selection with the M5’s 24 preset slots.

## Accessibility and preservation requirements for review

- Every model, instance, action, parameter, setup warning, and unavailable reason has `en` and `pt-BR` text in the proposed data; technical command tokens remain exact. No slogan or marketing entry screen.
- The controller graphic is not the only way to select A–D. Require keyboard-selectable controls, meaningful accessible names, visible focus, associated field labels/errors, and non-color state indicators. Announce connection/read/apply failures; do not speak a storage match as a successful musical response.
- Use constrained preset 1–24 and expression 0–127 inputs. On rejection, keep the stored value and displayed value consistent; do not clamp or silently substitute a different action.
- Profiles and templates are bundled declarative data, interpreted client-side with no eval, remote scripts, cloud lookup, account, or telemetry requirement. Imports remain untrusted.
- Preserve JSON/FCP import/export and opaque controller bytes. Import or template selection creates a reviewed draft, never a hardware write. Preserve custom Unicode labels. An opaque existing action must remain intact when the user edits A; an unrecognized setting is not permission to reset it.

## Explicit non-features and evidence boundary

Unavailable in this proposal: arbitrary per-parameter CC/MIDI learn, M5 bank select, reliable next/previous-preset command, query-current-state/feedback-aware toggles, remote rename/save, M5 SysEx backup/restore, firmware/reset, and clock generation/routing. “Unavailable” means not supported by this design/evidence, not proof that every conceivable firmware implementation lacks a feature.

All catalog actions are **manufacturer-documented, destination hardware not tested**. Earlier Chocolate storage experiments do not upgrade that status. Review gates before implementation: approve the data contract and novice flow; qualify actual MIDI DIN topology; qualify controller short/hold behavior and destination response; define accessible failure/recovery states. This delivery performs none of those hardware experiments.
