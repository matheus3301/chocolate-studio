# Operating-mode setup

This contract replaces the Advanced-only setup assumption in beta.4. The user
chooses how the Chocolate operates before editing assignments. The destination
equipment profile explains musical actions only where the selected controller
mode can actually store those actions.

## Flow

1. Connect, read the controller and retain its complete original configuration.
2. Show the current operating mode. Offer all thirteen modes observed in the
   installed CubeSuite, grouped by purpose. Continuing without changing the
   selection keeps the mode that was read.
3. Show the settings and assignment controls for that mode. For freely assigned
   MIDI actions, choose the destination/profile and edit the physical switch.
   Fixed layouts show what A–D do, without presenting inactive Advanced
   assignments as the current controller configuration.
4. Review mode, global settings and assignments together. Save is explicit;
   changing a select control changes the local draft only.
5. Require acknowledged writes and exact complete readback before reporting
   that configuration was saved. Ask for a physical destination check separately.

The editor always has a visible way to change the operating mode. A resumed
offline draft is identified as a draft; it is not evidence of the connected
controller's current mode. Imported projects retain their mode and settings.

## Mode families

| Purpose | CubeSuite mode | Editing model |
| --- | --- | --- |
| Sequential preset selection | Program change A | Fixed PC 000–127, channel and range |
| Sequential MIDI controls | Program change B | Fixed CC 000–127/value 0, channel and range |
| Four custom command selectors | Custom mode | A–D command and associated behavior options |
| Musical actions and gestures | Advanced custom mode | Mapped eight groups, four switches, five behaviors, two message sequences |
| M-VAVE device control | Manufacturer control | Built-in mode; only observed relevant global options |
| Android gestures | Touch screen (Android) | Fixed up/down/left/right swipes |
| Video playback | Video Model | Fixed rewind/forward/play-pause/loop controls |
| Arrow keys | Keyboard A | Fixed Up/Down/Left/Right |
| Page and navigation keys | Keyboard B | Fixed Page Up/Page Down/Space/Enter |
| Media keys | MultiMedia keyboard | Fixed previous/next track and volume |
| Keyboard shortcuts | Custom keyboard mode | Mapped shortcut groups and combinations |
| MIDI and keyboard together | Mix key | Mapped per-switch function and its corresponding editor |
| Speaker control | Speaker mode | Built-in mode; only observed relevant global options |

Stored IDs and field provenance belong in
[the layout mapping](../../packages/chocolate-layout/MAPPING.md), not novice-facing
copy. A manufacturer mode label is not proof of compatibility with every device
from that manufacturer. No arbitrary destination preset or action is invented
for fixed-function modes.

## Display and navigation

For sequential modes, emphasize the displayed numbers: `000–003`, `004–007`,
and so on, up to the configured last position. A–D choose the four positions;
E = A+B and F = C+D select the surrounding set. The user's observed flashing
`007` followed by A=`004` is consistent with this model. Do not turn these
positions into 128 freely programmable tap/hold assignments.

For Advanced and other editable groups, group selection in the editor does not
claim live hardware navigation or E/F support. Manual revisions differ about
Advanced modes and group limits. The app must follow the observed layout for the
qualified controller, not merge incompatible manual revisions into new features.

## Preservation and review

- Keep the original raw image and all unidentified or inactive fields.
- Never replace an unknown mode with Advanced by omitting a property.
- A mode-only change must not rewrite stale Advanced assignments.
- Expose optional scalar fields as explicit edit intent; absence does not mean
  reset to zero.
- Do not convert a keyboard or fixed-layout action to MIDI just because a
  destination profile exists.
- Show the old and new mode by name in the write review. The device write plan
  applies assignment/settings data before activating the selected mode.
- Require a fresh full-baseline comparison, preserve the original backup, and
  invalidate previews after draft edits, rereads, port changes or disconnects.

## Interface acceptance

One question leads each setup screen. The mode selector is compact and grouped;
its description explains a musician's intended use. The physical A–D arrangement
remains recognizable. Technical details, file operations and backups are
available without dominating the editor.

Verify Portuguese and English at 320, 390, 830 and 1280px, including open project
controls, long names, validation errors, both gesture forms, and mode changes.
Controls must not overlap or escape their containers. Keyboard focus, labels,
touch targets and error recovery remain usable at every width.

See [experiment 006](../../research/experiments/006-operating-modes.md) for mode
and global-setting storage verification. Physical behavior remains a separate
qualification from successful configuration readback.
