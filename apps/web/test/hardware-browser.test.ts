import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeCandidatePacket, encodeCandidatePacket } from '@chocolate-studio/chocolate/protocol';
import { createBrowserHardware } from '../src/hardware-browser';
import type { HardwareService } from '../src/hardware.js';

function setup(identity = 'FootCtrlPlus_016') {
  let bytes = new Uint8Array(23646); bytes[0] = 3;
  let writes = 0; let corruptWrites = false;
  const writeRanges: { address: number; bytes: Uint8Array }[] = [];
  let afterIdentity: (() => void) | undefined;
  let afterWrite: (() => void) | undefined;
  class Input extends EventTarget {
    id = 'input-1'; name = 'Synthetic input'; manufacturer = 'Test'; state = 'connected';
    async open() { return this; } async close() { return this; }
  }
  const input = new Input();
  class Output extends EventTarget {
    id = 'output-1'; name = 'Synthetic output'; manufacturer = 'Test'; state = 'connected';
    async open() { return this; } async close() { return this; }
    send(data: number[]) {
      const packet = decodeCandidatePacket(data); const body = packet.body.toUint8Array(); let response: Uint8Array;
      if (packet.command === 0x11) response = encodeCandidatePacket(0x11, new TextEncoder().encode(identity));
      else {
        const address = new DataView(body.buffer).getUint32(1, true);
        const length = body[5]! | body[6]! << 8 | body[7]! << 16;
        if (packet.command === 0x23) {
          const result = new Uint8Array(8 + length); result.set(body); result.set(bytes.slice(address, address + length), 8);
          response = encodeCandidatePacket(0x23, result);
        } else if (packet.command === 0x22) {
          writes++; if (!corruptWrites) bytes.set(body.slice(8), address);
          writeRanges.push({ address, bytes: body.slice(8) });
          response = encodeCandidatePacket(0, [0]);
        } else throw new Error('Unexpected command');
      }
      queueMicrotask(() => {
        input.dispatchEvent(Object.assign(new Event('midimessage'), { data: response }));
        if (packet.command === 0x11) afterIdentity?.();
        if (packet.command === 0x22) afterWrite?.();
      });
    }
  }
  const output = new Output();
  const access = { sysexEnabled: true, inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]), onstatechange: null };
  vi.stubGlobal('navigator', { requestMIDIAccess: async () => access });
  return { service: createBrowserHardware(), input, output, get bytes() { return bytes; }, set bytes(value) { bytes = value; },
    get writes() { return writes; }, writeRanges, corrupt() { corruptWrites = true; }, afterIdentity(fn: () => void) { afterIdentity = fn; },
    afterWrite(fn: () => void) { afterWrite = fn; } };
}
async function connect(fixture: ReturnType<typeof setup>) {
  await fixture.service.requestPorts(); await fixture.service.connect({ inputId: fixture.input.id, outputId: fixture.output.id });
}
async function protectedRead(service: HardwareService) {
  const read = await service.read();
  const original = service.getSnapshot().baseline!;
  await service.acknowledgeBackup({ baselineId: original.id, sha256: original.sha256, method: 'stored' });
  return read;
}
afterEach(() => vi.unstubAllGlobals());
describe('browser hardware boundary with synthetic MIDI endpoints', () => {
  it('locks concurrent connection attempts before the first await', async () => {
    const f = setup(); await f.service.requestPorts();
    const first = f.service.connect({ inputId: f.input.id, outputId: f.output.id });
    await expect(f.service.connect({ inputId: f.input.id, outputId: f.output.id })).rejects.toThrow('hardware.busy');
    await first; expect(f.service.getSnapshot().status).toBe('connected');
  });
  it('does not resurrect a connection cancelled immediately after its identity reply', async () => {
    const f = setup(); await f.service.requestPorts();
    f.afterIdentity(() => { void f.service.disconnect(); });
    await expect(f.service.connect({ inputId: f.input.id, outputId: f.output.id })).rejects.toThrow();
    expect(f.service.getSnapshot().status).toBe('disconnected');
    expect(f.service.getSnapshot().identity).toBeNull(); expect(f.service.getSnapshot().capabilities.write).toBe(false);
  });
  it('requires explicit selected ports and recognized identity', async () => {
    const f = setup('Other_Controller'); await f.service.requestPorts();
    await expect(f.service.connect({ inputId: 'missing', outputId: f.output.id })).rejects.toThrow('hardware.portMissing');
    await expect(f.service.connect({ inputId: f.input.id, outputId: f.output.id })).rejects.toThrow('hardware.unsupportedDevice');
    expect(f.writes).toBe(0); expect(f.service.getSnapshot().capabilities.write).toBe(false);
  });
  it.each(['FootCtrlPlus_015', 'FootCtrlPlus_017', 'FootCtrlPlus_016-extra'])('refuses writes for unqualified identity %s', async identity => {
    const f = setup(identity); await f.service.requestPorts();
    await expect(f.service.connect({ inputId: f.input.id, outputId: f.output.id })).rejects.toThrow('hardware.unsupportedDevice');
    expect(f.service.getSnapshot().identity).toBeNull();
    expect(f.service.getSnapshot().capabilities).toEqual({ read: false, preview: false, write: false, restore: false });
    expect(f.writes).toBe(0);
  });

  it('invalidates a pending write on disconnect without altering the retained caller backup', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service);
    const original = read.rawBackup.bytes.slice();
    read.configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 12 }] }];
    const preview = await f.service.preview(read.configuration);
    await f.service.disconnect();
    await expect(f.service.write(preview.id)).rejects.toThrow('hardware.expiredPreview');
    expect(f.writes).toBe(0);
    expect(read.rawBackup.bytes).toEqual(original);
    expect(f.service.getSnapshot().observed).toBeNull();
    expect(f.service.getSnapshot().verified).toBeNull();
  });
  it('writes only an unmodified preview baseline, verifies complete result and restores exact backup', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service); const original = f.bytes.slice();
    read.configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 4, program: 17 }] }];
    const preview = await f.service.preview(read.configuration); expect(f.writes).toBe(0);
    // Caller mutation cannot alter the adapter-owned write plan.
    preview.configuration.groups[0]!.switches.A.actions[0]!.messages = [{ type: 'pc', channel: 16, program: 126 }];
    const verified = await f.service.write(preview.id);
    expect(verified.verifiedAt).toBeGreaterThan(0); expect(f.bytes[97]).toBe(17);
    expect(f.service.getSnapshot().baseline!.bytes).toEqual(original);
    await expect(f.service.write(preview.id)).rejects.toThrow('hardware.expiredPreview');
    await f.service.restore(read.rawBackup); expect(f.bytes).toEqual(original);
    expect(f.service.getSnapshot().history.length).toBeLessThanOrEqual(200);
    await f.service.disconnect(); expect(f.service.getSnapshot().observed).toBeNull();
  });
  it('rejects stale drafts before any hardware write', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service);
    read.configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'cc', channel: 1, controller: 69, value: 127 }] }];
    const preview = await f.service.preview(read.configuration); f.bytes[11] = 99;
    await expect(f.service.write(preview.id)).rejects.toThrow('hardware.conflict'); expect(f.writes).toBe(0);
    expect(f.service.getSnapshot().verified).toBeNull();
  });
  it('does not report ACK-only success when the readback differs', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service); f.corrupt();
    read.configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 9 }] }];
    const preview = await f.service.preview(read.configuration);
    await expect(f.service.write(preview.id)).rejects.toThrow();
    expect(f.service.getSnapshot().verified).toBeNull(); expect(f.service.getSnapshot().capabilities.write).toBe(false);
    expect(f.service.getSnapshot().baseline!.bytes).toEqual(read.rawBackup.bytes);
  });
  it('restores a structurally valid imported FCP only through the explicit restore operation', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service);
    const imported = structuredClone(read.rawBackup); imported.bytes[2] = 3;
    imported.identity = { name: 'imported.fcp', model: null, manufacturer: null, firmware: null };
    imported.source = 'file';
    imported.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(imported.bytes).buffer)), b => b.toString(16).padStart(2, '0')).join('');
    expect(f.writes).toBe(0);
    const verified = await f.service.restore(imported);
    expect(verified.rawBackup.bytes[2]).toBe(3); expect(f.service.getSnapshot().baseline!.bytes[2]).toBe(0);
  });
  it('rejects imported FCP values outside the derived field domains', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service);
    const imported = structuredClone(read.rawBackup); imported.bytes[2] = 255; imported.source = 'file';
    imported.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(imported.bytes).buffer)), b => b.toString(16).padStart(2, '0')).join('');
    await expect(f.service.restore(imported)).rejects.toThrow('hardware.invalidBackup'); expect(f.writes).toBe(0);
  });
});

describe('original backup and read/session boundary', () => {
  it('distinguishes connected from read and refuses writes/restores before original backup confirmation', async () => {
    const f = setup(); f.bytes[0] = 0; f.bytes[0x5c5c] = 0; await connect(f);
    expect(f.service.getSnapshot().observed).toBeNull();
    await expect(f.service.acknowledgeBackup({ baselineId: 'invented', sha256: 'invented', method: 'stored' })).rejects.toThrow('connection:backupRequired');
    const read = await f.service.read();
    expect(read.controller).toMatchObject({ rawMode: 0, modeKind: 'program-change', displayStyle: 'pc-number', pcDisplayEnabled: false });
    read.configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 9 }] }];
    read.configuration.controller = { ...read.configuration.controller, mode: 3 };
    const preview = await f.service.preview(read.configuration);
    await expect(f.service.write(preview.id)).rejects.toThrow('connection:backupRequired');
    await expect(f.service.restore(read.rawBackup)).rejects.toThrow('connection:backupRequired');
    expect(f.writes).toBe(0);
    const original = f.service.getSnapshot().baseline!;
    // Mutating a public snapshot is not an adapter-owned acknowledgement.
    f.service.getSnapshot().backupSafety = { baselineId: original.id, sha256: original.sha256, method: 'stored' };
    await expect(f.service.write(preview.id)).rejects.toThrow('connection:backupRequired');
    await f.service.acknowledgeBackup({ baselineId: original.id, sha256: original.sha256, method: 'downloaded' });
    await f.service.write(preview.id);
    expect(f.bytes[97]).toBe(9);
  });

  it('invalidates preview on reread and backup proof on disconnect, even for identical bytes', async () => {
    const f = setup(); await connect(f); const first = await protectedRead(f.service);
    const original = f.service.getSnapshot().baseline!;
    const oldProof = { baselineId: original.id, sha256: original.sha256, method: 'downloaded' as const };
    first.configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 8 }] }];
    const preview = await f.service.preview(first.configuration);
    await f.service.read();
    await expect(f.service.write(preview.id)).rejects.toThrow('hardware.expiredPreview');
    const previousEpoch = f.service.getSnapshot().connectionEpoch;
    await f.service.disconnect(); await connect(f); await f.service.read();
    expect(f.service.getSnapshot().connectionEpoch).not.toBe(previousEpoch);
    expect(f.service.getSnapshot().backupSafety).toBeNull();
    await expect(f.service.acknowledgeBackup(oldProof)).rejects.toThrow('connection:backupRequired');
    expect(f.writes).toBe(0);
  });
});

describe('mode-aware session writes', () => {
  it.each(Array.from({ length: 13 }, (_, mode) => mode))('previews and verifies a mode-only transition to raw %i without changing other bytes', async mode => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service);
    const original = f.bytes.slice();
    read.configuration.controller!.mode = mode;
    const preview = await f.service.preview(read.configuration);
    expect(preview.configuration.controller!.mode).toBe(mode);
    expect(preview.patches).toEqual(mode === 3 ? [] : [{ offset: 0, before: 3, after: mode }]);
    expect(f.writes).toBe(0);
    const verified = await f.service.write(preview.id);
    const expected = original.slice(); expected[0] = mode;
    expect(f.bytes).toEqual(expected);
    expect(verified.configuration.controller!.mode).toBe(mode);
    expect(f.service.getSnapshot().baseline!.bytes).toEqual(original);
  });

  it('writes globals before mode, ignoring inactive stale Advanced edits, then restores the original mode and image', async () => {
    const f = setup(); f.bytes[11] = 231; f.bytes[0x34c5] = 201;
    await connect(f); const read = await protectedRead(f.service); const original = f.bytes.slice();
    read.configuration.controller = { ...read.configuration.controller, mode: 1, channelIndex: 15, ccMaxGroupIndex: 31 };
    read.configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 44 }] }];
    const preview = await f.service.preview(read.configuration);
    expect(preview.patches).toEqual([
      { offset: 0, before: 3, after: 1 }, { offset: 2, before: 0, after: 15 }, { offset: 0x5c56, before: 0, after: 31 },
    ]);
    const verified = await f.service.write(preview.id);
    expect(f.writeRanges.map(range => range.address)).toEqual([2, 0x5c56, 0]);
    expect(verified.configuration.controller).toMatchObject({ mode: 1, channelIndex: 15, ccMaxGroupIndex: 31 });
    expect(f.bytes.slice(0x5d, 0x5c55)).toEqual(original.slice(0x5d, 0x5c55));
    await f.service.restore(read.rawBackup);
    expect(f.bytes).toEqual(original);
    expect(f.service.getSnapshot().baseline!.bytes).toEqual(original);
  });

  it('requires a supported selection for an unknown incoming mode and never falls back for legacy intent', async () => {
    const f = setup(); f.bytes[0] = 250; await connect(f); const read = await protectedRead(f.service);
    expect(read.configuration.controller!.mode).toBe(250);
    delete read.configuration.controller;
    const guarded = await f.service.preview(read.configuration);
    expect(guarded.unsupported).toContain('hardware.unrecognizedFields');
    expect(guarded.patches).toEqual([]);
    await expect(f.service.write(guarded.id)).rejects.toThrow('hardware.unsupportedConfiguration');
    expect(f.writes).toBe(0);
    read.configuration.controller = { mode: 0 };
    const explicit = await f.service.preview(read.configuration);
    expect(explicit.patches).toEqual([{ offset: 0, before: 250, after: 0 }]);
    const verified = await f.service.write(explicit.id);
    expect(verified.configuration.controller!.mode).toBe(0);
    expect(f.service.getSnapshot().baseline!.bytes[0]).toBe(250);
  });

  it('replaces a mode-change preview on revert and checks the full baseline before any mode-only write', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service);
    read.configuration.controller!.mode = 0;
    const changed = await f.service.preview(read.configuration);
    read.configuration.controller!.mode = 3;
    const reverted = await f.service.preview(read.configuration);
    expect(reverted.patches).toEqual([]);
    await expect(f.service.write(changed.id)).rejects.toThrow('hardware.expiredPreview');
    f.bytes[11] = 99;
    await expect(f.service.write(reverted.id)).rejects.toThrow('hardware.conflict');
    expect(f.writes).toBe(0);
    expect(f.service.getSnapshot().verified).toBeNull();
  });
});

describe('interrupted mode activation', () => {
  it('does not send the final mode change after disconnect during a global write', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service);
    const original = read.rawBackup.bytes.slice();
    read.configuration.controller = { ...read.configuration.controller, mode: 0, channelIndex: 1 };
    const preview = await f.service.preview(read.configuration);
    f.afterWrite(() => { void f.service.disconnect(); });
    await expect(f.service.write(preview.id)).rejects.toThrow();
    expect(f.writeRanges.map(range => range.address)).toEqual([2]);
    expect(f.bytes[0]).toBe(3);
    expect(f.service.getSnapshot().verified).toBeNull();
    expect(read.rawBackup.bytes).toEqual(original);
  });
});

describe('mode-owned payload readback', () => {
  it('writes the last keyboard shortcut as observed scalar fields before activation, without touching Advanced or Mixed banks', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service);
    const original = f.bytes.slice();
    read.configuration.controller!.mode = 10;
    read.configuration.controller!.keyboardAssignments!.find(value => value.groupIndex === 5 && value.switchId === 'D')!.combination =
      { modifier1: 1, modifier2: 2, key: 62 };
    const preview = await f.service.preview(read.configuration);
    const verified = await f.service.write(preview.id);
    const expected = original.slice(); expected[0] = 10; expected.set([63, 64, 62], 0x34c2);
    expect(f.bytes).toEqual(expected);
    expect(f.writeRanges.map(range => range.address)).toEqual([0x34c2, 0x34c3, 0x34c4, 0]);
    expect(verified.configuration.controller!.keyboardAssignments).toContainEqual({
      groupIndex: 5, switchId: 'D', combination: { modifier1: 1, modifier2: 2, key: 62 },
    });
  });

  it('writes dedicated pedal endpoint values using the retained interface bank, not typed MIDI records', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service);
    const original = f.bytes.slice();
    read.configuration.controller!.interfaceAssignments = [{ slot: 15, channel: 16, data: 127, releaseValue: 31, pressValue: 95 }];
    const preview = await f.service.preview(read.configuration);
    const verified = await f.service.write(preview.id);
    const expected = original.slice(); expected.set([1, 15, 127, 31, 95], 0x58);
    expect(f.bytes).toEqual(expected);
    expect(f.writeRanges.map(range => ({ address: range.address, length: range.bytes.length }))).toEqual([{ address: 0x0d, length: 80 }]);
    expect(verified.configuration.controller!.interfaceAssignments).toEqual(read.configuration.controller!.interfaceAssignments);
  });

  it('writes Mixed sequences and activates the mode without consuming the independent Advanced draft', async () => {
    const f = setup(); await connect(f); const read = await protectedRead(f.service);
    const original = f.bytes.slice();
    read.configuration.controller!.mode = 11;
    read.configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 99 }] }];
    read.configuration.mixedGroups![0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'cc', channel: 3, controller: 64, value: 127 }] }];
    const preview = await f.service.preview(read.configuration);
    const verified = await f.service.write(preview.id);
    const expected = original.slice(); expected[0] = 11; expected.set([1, 2, 1, 64, 127], 0x34c5 + 6);
    expect(f.bytes).toEqual(expected);
    expect(f.writeRanges.at(-1)!.address).toBe(0);
    expect(verified.configuration.groups[0]!.switches.A.actions).toEqual([]);
    expect(verified.configuration.mixedGroups![0]!.switches.A.actions).toEqual(read.configuration.mixedGroups![0]!.switches.A.actions);
    expect(f.service.getSnapshot().baseline!.bytes).toEqual(original);
  });
});
