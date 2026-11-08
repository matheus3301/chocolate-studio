import { describe, expect, it } from 'vitest';
import { createDefaultConfiguration } from '@chocolate-studio/midi';
import { bindPreview, previewIsCurrent } from '../src/connection-preview';
import type { HardwareSnapshot, WritePreview } from '../src/hardware';

function fixture() {
  const configuration = createDefaultConfiguration();
  configuration.controller = { mode: 0, channelIndex: 0 };
  const identity = { name: 'FootCtrlPlus_016', manufacturer: null, model: null, firmware: null };
  const snapshot: HardwareSnapshot = {
    status: 'connected', reason: null, inputs: [], outputs: [], selection: { inputId: 'in', outputId: 'out' }, identity,
    capabilities: { read: true, preview: true, write: true, restore: true },
    observed: { configuration, rawBackup: { id: 'read-1', bytes: new Uint8Array(23646), sha256: 'full-image-hash', capturedAt: 1, identity }, readAt: 1, warnings: [] },
    verified: null, baseline: null, history: [], connectionEpoch: 1,
  };
  const preview: WritePreview = { id: 'preview-1', baselineSha256: 'full-image-hash', configuration,
    patches: [], warnings: [], unsupported: [] };
  return { snapshot, preview, configuration };
}

describe('complete controller draft approval', () => {
  it('expires approval for mode-only or global-only edits even when Advanced groups are unchanged', () => {
    const { snapshot, preview, configuration } = fixture();
    const signature = JSON.stringify(configuration);
    const approval = bindPreview(preview, signature, snapshot);
    expect(previewIsCurrent(approval, signature, snapshot)).toBe(true);
    configuration.controller!.mode = 1;
    expect(previewIsCurrent(approval, JSON.stringify(configuration), snapshot)).toBe(false);
    configuration.controller!.mode = 0;
    configuration.controller!.channelIndex = 15;
    expect(previewIsCurrent(approval, JSON.stringify(configuration), snapshot)).toBe(false);
  });

  it('expires approval during an operation or after a read, port or connection change', () => {
    const { snapshot, preview, configuration } = fixture();
    const signature = JSON.stringify(configuration);
    const approval = bindPreview(preview, signature, snapshot);
    expect(previewIsCurrent(approval, signature, { ...snapshot, status: 'busy' })).toBe(false);
    expect(previewIsCurrent(approval, signature, { ...snapshot, status: 'disconnected' })).toBe(false);
    expect(previewIsCurrent(approval, signature, { ...snapshot, connectionEpoch: 2 })).toBe(false);
    expect(previewIsCurrent(approval, signature, { ...snapshot, selection: { inputId: 'other', outputId: 'out' } })).toBe(false);
    expect(previewIsCurrent(approval, signature, { ...snapshot, observed: { ...snapshot.observed!,
      rawBackup: { ...snapshot.observed!.rawBackup, id: 'read-2' } } })).toBe(false);
    expect(previewIsCurrent(approval, signature, { ...snapshot, observed: { ...snapshot.observed!,
      rawBackup: { ...snapshot.observed!.rawBackup, sha256: 'changed-image-hash' } } })).toBe(false);
  });
});
