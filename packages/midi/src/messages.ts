import { z } from 'zod';

export const midiChannelSchema = z.number().int().min(1).max(16);
export const midiDataByteSchema = z.number().int().min(0).max(127);
export const identifierSchema = z.string().min(1).max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  .refine((id) => !['__proto__', 'prototype', 'constructor'].includes(id), 'Reserved identifier');

export const bankSelectSchema = z.strictObject({
  msb: midiDataByteSchema.optional(),
  lsb: midiDataByteSchema.optional(),
}).refine((bank) => bank.msb !== undefined || bank.lsb !== undefined, 'Bank must specify MSB or LSB');

export const programChangeSchema = z.strictObject({
  type: z.literal('pc'),
  channel: midiChannelSchema,
  program: midiDataByteSchema,
  bank: bankSelectSchema.optional(),
  destinationId: identifierSchema.optional(),
});

export const controlChangeSchema = z.strictObject({
  type: z.literal('cc'),
  channel: midiChannelSchema,
  controller: midiDataByteSchema,
  value: midiDataByteSchema,
  destinationId: identifierSchema.optional(),
});

export const midiMessageSchema = z.discriminatedUnion('type', [programChangeSchema, controlChangeSchema]);
export type BankSelect = z.infer<typeof bankSelectSchema>;
export type ProgramChange = z.infer<typeof programChangeSchema>;
export type ControlChange = z.infer<typeof controlChangeSchema>;
export type MidiMessage = z.infer<typeof midiMessageSchema>;
export type PresetDisplayBase = 0 | 1;

/** One-based UI channel; zero-based MIDI program. No transport or device access. */
export function encodeProgramChange(channel: number, program: number): Uint8Array {
  return Uint8Array.of(0xc0 | (midiChannelSchema.parse(channel) - 1), midiDataByteSchema.parse(program));
}

export function encodeControlChange(channel: number, controller: number, value: number): Uint8Array {
  return Uint8Array.of(0xb0 | (midiChannelSchema.parse(channel) - 1),
    midiDataByteSchema.parse(controller), midiDataByteSchema.parse(value));
}

/** Expand requested bank select as CC0, CC32, then PC; omitted bank bytes stay omitted. */
export function encodeMidiMessage(input: MidiMessage): Uint8Array[] {
  const message = midiMessageSchema.parse(input);
  if (message.type === 'cc') {
    return [encodeControlChange(message.channel, message.controller, message.value)];
  }
  const bytes: Uint8Array[] = [];
  if (message.bank?.msb !== undefined) bytes.push(encodeControlChange(message.channel, 0, message.bank.msb));
  if (message.bank?.lsb !== undefined) bytes.push(encodeControlChange(message.channel, 32, message.bank.lsb));
  bytes.push(encodeProgramChange(message.channel, message.program));
  return bytes;
}

const displayBaseSchema = z.union([z.literal(0), z.literal(1)]);

export function programToDisplay(program: number, base: PresetDisplayBase): number {
  return midiDataByteSchema.parse(program) + displayBaseSchema.parse(base);
}

export function displayToProgram(display: number, base: PresetDisplayBase): number {
  const offset = displayBaseSchema.parse(base);
  return z.number().int().min(offset).max(127 + offset).parse(display) - offset;
}

export const ccToggleSchema = z.strictObject({
  channel: midiChannelSchema,
  controller: midiDataByteSchema,
  offValue: midiDataByteSchema,
  onValue: midiDataByteSchema,
  destinationId: identifierSchema.optional(),
});
export type CcToggle = z.infer<typeof ccToggleSchema>;

/** Explicit desired state; never assumes or mutates a device's current state. */
export function ccToggleMessage(input: CcToggle, state: 'off' | 'on'): ControlChange {
  const toggle = ccToggleSchema.parse(input);
  z.enum(['off', 'on']).parse(state);
  return {
    type: 'cc', channel: toggle.channel, controller: toggle.controller,
    value: state === 'on' ? toggle.onValue : toggle.offValue,
    ...(toggle.destinationId === undefined ? {} : { destinationId: toggle.destinationId }),
  };
}
