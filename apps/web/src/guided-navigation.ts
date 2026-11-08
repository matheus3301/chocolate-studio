import { SWITCH_IDS } from '@chocolate-studio/midi';
import type { Group, SwitchConfiguration } from '@chocolate-studio/midi';

/** Command labels describe stored intent, not physical display telemetry. */
export function primaryProgram(pedal: SwitchConfiguration): number | undefined {
  if (pedal.actions.length !== 1 || pedal.actions[0]?.gesture !== 'press') return undefined;
  const messages = pedal.actions[0].messages;
  const message = messages[0];
  return messages.length === 1 && message?.type === 'pc' && !message.bank ? message.program : undefined;
}

/** A numeric range is meaningful only for four coherent, consecutive single-PC assignments. */
export function groupProgramRange(group: Group): string | undefined {
  const pedals = SWITCH_IDS.map((id) => group.switches[id]);
  if (pedals.some((pedal) => (pedal.behavior ?? 'single') !== 'single' || pedal.secondaryMessages?.length)) return undefined;
  const programs = pedals.map(primaryProgram);
  const first = programs[0];
  if (first === undefined || programs.some((program, index) => program !== first + index)) return undefined;
  const channel = pedals[0]!.actions[0]!.messages[0]!.channel;
  if (pedals.some((pedal) => pedal.actions[0]!.messages[0]!.channel !== channel)) return undefined;
  return `${formatCommandNumber(first)}–${formatCommandNumber(first + 3)}`;
}

export function formatCommandNumber(program: number): string {
  return String(program).padStart(3, '0');
}
