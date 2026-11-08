# Hardware adapter handoff

Implement `apps/web/src/hardware-browser.ts` exporting an object that satisfies
`HardwareService` from `src/hardware.ts`. The UI accepts `hardware?: HardwareService`
on `App`; the parent can inject its service in `main.tsx` without changing editor
components. The default is honestly unavailable and rejects every device action.

## State and lifecycle

- `getSnapshot()` must return the same object until state changes. Publish a new
  snapshot and notify `subscribe` listeners after a transition. UI uses React
  `useSyncExternalStore`. Never mutate an already published snapshot or its bytes.
- `requestPorts()` is called from a user gesture. Request Web MIDI/SysEx permission
  and populate `inputs`/`outputs`. `connect({ inputId, outputId })` receives explicit
  user selections; never guess ports. Publish identity only from evidence.
- Capabilities gate each read/preview/write/restore button independently. Unsupported
  layouts/fields must be rejected, never partially written or ignored.
- Serialize device I/O and reject concurrent operations. Disconnect/port changes
  cancel pending operations and invalidate preview tokens. Clear observed/verified
  state on disconnect so another device cannot inherit current-state claims.
- `reason`/warnings/events are display strings: no stack traces, raw configuration
  dumps, credentials, or claims that send alone succeeded.

## Read / review / write / restore

`read()` returns complete `DeviceRead`: mapped `StudioConfiguration`, complete owned
raw bytes, SHA256, device identity, timestamp, and mapping warnings. Publish it as
`observed`. Unmapped bytes remain in `rawBackup`, never reconstructed from intent.
Retain the pre-first-write complete raw backup as `snapshot.baseline`.

`preview(draft)` performs no writes. Return an adapter-owned token, exact baseline
hash, full intended configuration, ordered `{ offset, before, after }` patches,
warnings and unsupported-field reasons. UI reviews the plan before invoking
`write(token)`. Reject stale/consumed tokens, changed sessions/baselines, and any
unsupported changes. Apply patches serially, require success ACK, reread completely,
and compare the intended change plus untouched bytes before publishing `verified`.
`VerifiedDeviceRead.verifiedAt` is only set after that comparison.

`restore(rawBackup)` validates the complete baseline and device match, writes,
requires ACK and rereads all bytes with exact equality before publishing verified
state. UI has explicit confirmation; it never calls factory reset. Failure remains
failure even if some bytes may have been sent: retain recovery information and
report the device's uncertain state.

`history` is oldest first, max `HARDWARE_HISTORY_LIMIT` (200). Limit byte arrays per
MIDI event as appropriate; do not retain full configuration dumps in monitor text.
`clearHistory` publishes a new snapshot. UI combines these real events with bounded
local file/storage activity. The offline default emits no fake MIDI messages.

## Integration boundaries

The editor uses the actual `@chocolate-studio/midi` schema directly, including the
separate two-sequence domain addition. Import/export and local backups are intent
JSON, not raw hardware backups. Raw backup download/restore stays a distinct flow.
Parent owns transport, protocol mapping, unknown-byte preservation, and hardware
validation. No hardware/browser/deployment action is authorized for this worker.
