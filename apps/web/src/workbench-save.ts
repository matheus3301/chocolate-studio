import { studioConfigurationSchema } from '@chocolate-studio/midi';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import type { HardwareSnapshot } from './hardware.js';
import type { PreviewApproval } from './connection-preview.js';
import { previewIsCurrent } from './connection-preview.js';
import { originalBackupIsSafe } from './connection-backup.js';
import { configurationToBytes } from './hardware-mapping.js';

export interface DeviceDraftStatus {
  kind: 'disconnected' | 'invalid' | 'unsupported' | 'changes' | 'noop' | 'verified';
  unsupported: string[];
  warnings: string[];
  changedBytes: number;
}

/** Compare device bytes, not metadata/IDs or the parent's last adopted read. Never performs I/O. */
export function inspectDeviceDraft(configuration: StudioConfiguration, state: HardwareSnapshot): DeviceDraftStatus {
  const empty = { unsupported: [], warnings: [], changedBytes: 0 };
  if (!state.observed || !state.identity || !state.selection) return { ...empty, kind: 'disconnected' };
  try {
    const input = studioConfigurationSchema.parse(configuration);
    const before = state.observed.rawBackup.bytes;
    // Match the adapter's legacy-mode preservation, not an inferred switch to Advanced.
    input.controller = { ...input.controller, mode: input.controller?.mode ?? before[0]! };
    const mapped = configurationToBytes(before, input);
    let changedBytes = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== mapped.bytes[i]) changedBytes++;
    return { unsupported: mapped.unsupported, warnings: mapped.warnings, changedBytes,
      kind: mapped.unsupported.length ? 'unsupported' : changedBytes ? 'changes' :
        state.verified?.rawBackup.id === state.observed.rawBackup.id ? 'verified' : 'noop' };
  } catch { return { ...empty, kind: 'invalid' }; }
}

export type SavePreviewDisposition = 'expired' | 'unsupported' | 'noop' | 'mode-review' | 'backup-required' | 'write';
/** Concrete approval remains bound to the complete draft/read/ports/epoch. */
export function savePreviewDisposition(approval: PreviewApproval, signature: string, state: HardwareSnapshot, modeConfirmed = false): SavePreviewDisposition {
  if (!previewIsCurrent(approval, signature, state)) return 'expired';
  if (approval.preview.unsupported.length) return 'unsupported';
  if (!approval.preview.patches.length) return 'noop';
  if (!modeConfirmed && approval.preview.patches.some(patch => patch.offset === 0 && patch.before !== patch.after)) return 'mode-review';
  if (!originalBackupIsSafe(state)) return 'backup-required';
  return 'write';
}
