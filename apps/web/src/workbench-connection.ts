import type { HardwareSnapshot, MidiPort, PortSelection } from './hardware.js';

export const QUALIFIED_CHOCOLATE_IDENTITY = 'FootCtrlPlus_016';
export type ConnectionCandidate =
  | { kind: 'candidate'; selection: PortSelection; source: 'remembered' | 'profile' }
  | { kind: 'session' | 'none' | 'manual' | 'ambiguous' | 'missing-remembered' };

/** A port name permits a targeted identity probe; it never establishes device identity. */
export function classifyConnectionCandidate(
  state: Pick<HardwareSnapshot, 'inputs' | 'outputs' | 'selection' | 'identity'>,
  remembered: PortSelection | null = null,
  existingSession = false,
): ConnectionCandidate {
  if (state.selection || state.identity) return { kind: 'session' };
  if (remembered) {
    if (state.inputs.some(port => port.id === remembered.inputId) && state.outputs.some(port => port.id === remembered.outputId)) {
      return { kind: 'candidate', selection: { ...remembered }, source: 'remembered' };
    }
    if (existingSession) return { kind: 'missing-remembered' };
  }
  if (existingSession) return { kind: 'missing-remembered' };
  if (!state.inputs.length || !state.outputs.length) return { kind: 'none' };
  const known = (port: MidiPort) => port.name.trim().toUpperCase() === 'SINCO';
  const inputs = state.inputs.filter(known);
  const outputs = state.outputs.filter(known);
  if (inputs.length > 1 || outputs.length > 1) return { kind: 'ambiguous' };
  const input = inputs[0]; const output = outputs[0];
  if (input && output && input.manufacturer.trim().toLowerCase() === output.manufacturer.trim().toLowerCase()) {
    return { kind: 'candidate', selection: { inputId: input.id, outputId: output.id }, source: 'profile' };
  }
  return { kind: 'manual' };
}

/** Unsupported permission queries must fall back to a user gesture, not trigger a prompt on mount. */
export async function midiPermission(): Promise<PermissionState | 'unknown'> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
    const result = await navigator.permissions.query({ name: 'midi', sysex: true } as unknown as PermissionDescriptor);
    return result.state;
  } catch { return 'unknown'; }
}

export function qualifiedConnection(state: HardwareSnapshot): boolean {
  return state.identity?.name === QUALIFIED_CHOCOLATE_IDENTITY && state.selection !== null && state.capabilities.read;
}
