import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeCandidatePacket, encodeCandidatePacket } from '@chocolate-studio/chocolate/protocol';
import { createBrowserHardware } from '../src/hardware-browser';
import type { HardwareService } from '../src/hardware.js';

function setup(identity = 'FootCtrlPlus_016') {
  let bytes = new Uint8Array(23646); bytes[0] = 3;
  let writes = 0; let corruptWrites = false;
  let afterIdentity: (() => void) | undefined;
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
          response = encodeCandidatePacket(0, [0]);
        } else throw new Error('Unexpected command');
      }
      queueMicrotask(() => {
        input.dispatchEvent(Object.assign(new Event('midimessage'), { data: response }));
        if (packet.command === 0x11) afterIdentity?.();
      });
    }
  }
  const output = new Output();
  const access = { sysexEnabled: true, inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]), onstatechange: null };
  vi.stubGlobal('navigator', { requestMIDIAccess: async () => access });
  return { service: createBrowserHardware(), input, output, get bytes() { return bytes; }, set bytes(value) { bytes = value; },
    get writes() { return writes; }, corrupt() { corruptWrites = true; }, afterIdentity(fn: () => void) { afterIdentity = fn; } };
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
