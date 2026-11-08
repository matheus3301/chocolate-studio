import type { HardwareSnapshot, WritePreview } from './hardware.js';

export interface PreviewApproval {
  preview: WritePreview;
  draftSignature: string;
  readId: string | null;
  epoch: number | undefined;
  ports: string;
}

/** Approval is for one exact draft/read/session, not merely a reusable preview ID. */
export function bindPreview(preview: WritePreview, draftSignature: string, snapshot: HardwareSnapshot): PreviewApproval {
  return { preview, draftSignature, readId: snapshot.observed?.rawBackup.id ?? null,
    epoch: snapshot.connectionEpoch, ports: JSON.stringify(snapshot.selection) };
}

export function previewIsCurrent(approval: PreviewApproval, draftSignature: string, snapshot: HardwareSnapshot): boolean {
  return approval.draftSignature === draftSignature && approval.epoch === snapshot.connectionEpoch &&
    approval.ports === JSON.stringify(snapshot.selection) && approval.readId !== null &&
    approval.readId === snapshot.observed?.rawBackup.id &&
    approval.preview.baselineSha256 === snapshot.observed.rawBackup.sha256 &&
    snapshot.identity !== null && snapshot.capabilities.write && snapshot.status !== 'error';
}
