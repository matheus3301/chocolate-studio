import { describe, expect, it } from 'vitest';
import {
  ccToggleMessage, displayToProgram, encodeControlChange, encodeMidiMessage,
  encodeProgramChange, presetToProgramChange, programToDisplay,
} from '../src/index.js';

const bytes = (messages: Uint8Array[]) => messages.map((message) => [...message]);

describe('channel voice encoding', () => {
  it.each([
    [1, 0, [0xc0, 0]], [1, 127, [0xc0, 127]],
    [16, 0, [0xcf, 0]], [16, 127, [0xcf, 127]],
  ])('encodes PC on channel %i, program %i', (channel, program, expected) => {
    expect([...encodeProgramChange(channel, program)]).toEqual(expected);
  });

  it('encodes CC at both channel and data boundaries', () => {
    expect([...encodeControlChange(1, 0, 127)]).toEqual([0xb0, 0, 127]);
    expect([...encodeControlChange(16, 127, 0)]).toEqual([0xbf, 127, 0]);
  });

  it.each([-1, 128, 1.5, NaN, Infinity])('rejects invalid data %s instead of truncating it', (value) => {
    expect(() => encodeProgramChange(1, value)).toThrow();
    expect(() => encodeControlChange(1, value, 0)).toThrow();
    expect(() => encodeControlChange(1, 0, value)).toThrow();
  });

  it.each([0, 17, 1.5, NaN])('rejects invalid channel %s', (channel) => {
    expect(() => encodeProgramChange(channel, 0)).toThrow();
    expect(() => encodeControlChange(channel, 0, 0)).toThrow();
  });

  it('orders requested MSB/LSB bank bytes before PC, preserving zero values', () => {
    expect(bytes(encodeMidiMessage({ type: 'pc', channel: 16, program: 127, bank: { msb: 0, lsb: 127 } })))
      .toEqual([[0xbf, 0, 0], [0xbf, 32, 127], [0xcf, 127]]);
    expect(bytes(encodeMidiMessage({ type: 'pc', channel: 1, program: 0, bank: { lsb: 0 } })))
      .toEqual([[0xb0, 32, 0], [0xc0, 0]]);
    expect(bytes(encodeMidiMessage({ type: 'pc', channel: 1, program: 0, bank: { msb: 1 } })))
      .toEqual([[0xb0, 0, 1], [0xc0, 0]]);
    expect(bytes(encodeMidiMessage({ type: 'pc', channel: 1, program: 0 }))).toEqual([[0xc0, 0]]);
  });

  it('turns a named preset into the actual program and bank reference', () => {
    const message = presetToProgramChange({ id: 'preset-1', name: 'Clean 🎵', channel: 2,
      program: 0, bank: { msb: 3 }, destinationId: 'amp' });
    expect(message).toEqual({ type: 'pc', channel: 2, program: 0, bank: { msb: 3 }, destinationId: 'amp' });
    expect(bytes(encodeMidiMessage(message))).toEqual([[0xb1, 0, 3], [0xc1, 0]]);
  });
});

describe('explicit display bases and toggle intent', () => {
  it.each([0, 1] as const)('roundtrips every MIDI program with display base %i', (base) => {
    for (let program = 0; program <= 127; program++) {
      expect(programToDisplay(program, base)).toBe(program + base);
      expect(displayToProgram(program + base, base)).toBe(program);
    }
    expect(() => displayToProgram(base - 1, base)).toThrow();
    expect(() => displayToProgram(base + 128, base)).toThrow();
    expect(() => displayToProgram(1.5, base)).toThrow();
  });

  it('supports explicit 0/127 toggle states and custom values without hidden state', () => {
    const toggle = { channel: 16, controller: 80, offValue: 0, onValue: 127, destinationId: 'amp' };
    expect(bytes(encodeMidiMessage(ccToggleMessage(toggle, 'off')))).toEqual([[0xbf, 80, 0]]);
    expect(bytes(encodeMidiMessage(ccToggleMessage(toggle, 'on')))).toEqual([[0xbf, 80, 127]]);
    expect(ccToggleMessage({ ...toggle, offValue: 12, onValue: 96 }, 'off').value).toBe(12);
    expect(ccToggleMessage({ ...toggle, offValue: 12, onValue: 96 }, 'on').value).toBe(96);
    expect(() => ccToggleMessage({ ...toggle, onValue: 128 }, 'on')).toThrow();
  });
});
