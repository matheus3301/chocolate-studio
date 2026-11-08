import { z } from 'zod';

export const controllerModeSchema = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12),
]);
export type ControllerMode = z.infer<typeof controllerModeSchema>;
type Text = Readonly<{ en: string; 'pt-BR': string }>;
export type ControllerAssignment = 'fixedPc' | 'fixedCc' | 'customSelectors' | 'advanced' |
  'fixedKeyboard' | 'keyboard' | 'mixed' | 'manufacturer' | 'speaker';
export interface ControllerModeDefinition {
  readonly raw: ControllerMode;
  readonly id: string;
  readonly label: Text;
  readonly description: Text;
  readonly capabilities: Readonly<{
    assignment: ControllerAssignment;
    groupCount: number;
    /** Host tooltip description, not hardware qualification. */
    fixedActions?: readonly string[];
  }>;
}
const text = (en: string, pt: string): Text => Object.freeze({ en, 'pt-BR': pt });
const mode = (raw: ControllerMode, id: string, en: string, pt: string, assignment: ControllerAssignment,
  groupCount: number, descriptionEn: string, descriptionPt: string, fixedActions?: readonly string[]): ControllerModeDefinition =>
  Object.freeze({ raw, id, label: text(en, pt), description: text(descriptionEn, descriptionPt),
    capabilities: Object.freeze({ assignment, groupCount, ...(fixedActions ? { fixedActions: Object.freeze(fixedActions) } : {}) }) });

/** Own CubeSuite init/retranslateUi member bindings; provenance in chocolate-layout/MAPPING.md.
 * Capabilities describe the host's storage/UI, never verified pedal emission. */
export const CONTROLLER_MODES: readonly ControllerModeDefinition[] = Object.freeze([
  mode(0, 'programChangeA', 'Change presets (PC)', 'Trocar presets (PC)', 'fixedPc', 32,
    'Select presets in sequence with A–D. Use E/F to change groups.',
    'Selecione presets em sequência com A–D. Use E/F para mudar de grupo.'),
  mode(1, 'programChangeB', 'Sequential controls (CC)', 'Controles em sequência (CC)', 'fixedCc', 32,
    'Send sequential controls with value 0. Use E/F to change groups.',
    'Envie controles em sequência com valor 0. Use E/F para mudar de grupo.'),
  mode(2, 'custom', 'MIDI command per button', 'Comando MIDI por botão', 'customSelectors', 1,
    'Choose a MIDI command for each button and the channel used to send it.',
    'Escolha um comando MIDI para cada botão e o canal usado para enviá-lo.'),
  mode(3, 'advanced', 'Custom MIDI actions', 'Ações MIDI personalizadas', 'advanced', 8,
    'Choose what each button does when tapped, held or alternating actions.',
    'Escolha o que cada botão faz ao tocar, segurar ou alternar ações.'),
  mode(4, 'manufacturer', 'Manufacturer control', 'Controle do fabricante', 'manufacturer', 1,
    'Equipment-specific built-in control; consult the destination equipment instructions.',
    'Controle interno específico do equipamento; consulte as instruções do destino.'),
  mode(5, 'touchScreen', 'Touch screen (Android)', 'Tela sensível ao toque (Android)', 'fixedKeyboard', 1,
    'Fixed Android swipe gestures on A–D.', 'Gestos Android fixos em A–D.', ['swipeUp', 'swipeDown', 'swipeLeft', 'swipeRight']),
  mode(6, 'video', 'Video Model', 'Modo de vídeo', 'fixedKeyboard', 1,
    'Fixed video controls; CubeSuite describes Chrome with an extension and YouTube support.',
    'Controles de vídeo fixos; o CubeSuite descreve Chrome com extensão e suporte a YouTube.', ['rewind', 'fastForward', 'playPause', 'loop']),
  mode(7, 'keyboardA', 'Keyboard A', 'Teclado A', 'fixedKeyboard', 1,
    'Fixed arrow keys on A–D.', 'Setas fixas em A–D.', ['up', 'down', 'left', 'right']),
  mode(8, 'keyboardB', 'Keyboard B', 'Teclado B', 'fixedKeyboard', 1,
    'Fixed Page Up, Page Down, Space and Enter on A–D.', 'Page Up, Page Down, Espaço e Enter fixos em A–D.', ['pageUp', 'pageDown', 'space', 'enter']),
  mode(9, 'multimedia', 'MultiMedia keyboard', 'Teclado multimídia', 'fixedKeyboard', 1,
    'Fixed previous/next song and volume controls.', 'Faixa anterior/seguinte e volume fixos.', ['previousTrack', 'nextTrack', 'volumeDown', 'volumeUp']),
  mode(10, 'customKeyboard', 'Custom keyboard mode', 'Teclado personalizado', 'keyboard', 6,
    'Six groups of four keyboard combinations; E/F change groups.', 'Seis grupos de quatro combinações de teclado; E/F mudam grupos.'),
  mode(11, 'mix', 'Mix MIDI and keyboard', 'Misturar MIDI e teclado', 'mixed', 6,
    'Choose MIDI actions, keyboard shortcuts or page-turning controls for each button.',
    'Escolha ações MIDI, atalhos de teclado ou controles de páginas para cada botão.'),
  mode(12, 'speaker', 'Speaker controls', 'Controlar caixa de som', 'speaker', 1,
    'Use the built-in controls for compatible speakers.',
    'Use os controles internos para caixas de som compatíveis.'),
]);
export function getControllerMode(raw: number): ControllerModeDefinition | undefined {
  return Number.isInteger(raw) ? CONTROLLER_MODES.find((entry) => entry.raw === raw) : undefined;
}

const index = (max: number) => z.number().int().min(0).max(max);
const flag = index(1);
/** Optional raw fields are explicit edit intent; omitted fields MUST NOT generate writes. */
export const controllerSettingsSchema = z.strictObject({
  // Unknown read modes remain explicit raw bytes, never omitted into legacy mode 3.
  // Selection/writes must validate controllerModeSchema (0..12) separately.
  mode: index(255).optional(),
  interfaceType: flag.optional(), channelIndex: index(15).optional(),
  visualA: flag.optional(), customCommandA: index(133).optional(),
  visualB: flag.optional(), customCommandB: index(133).optional(),
  visualC: flag.optional(), customCommandC: index(133).optional(),
  visualD: flag.optional(), customCommandD: index(133).optional(),
  interfaceCommand: index(129).optional(),
  pcMaxGroupIndex: index(31).optional(), ccMaxGroupIndex: index(31).optional(),
  advancedMaxGroupIndex: index(7).optional(), advancedGroupIndex: index(7).optional(),
  keyboardGroupIndex: index(5).optional(), mixGroupIndex: index(5).optional(),
  polarity: flag.optional(), bankMidi: flag.optional(), pcDisplay: flag.optional(),
});
export type ControllerSettings = z.infer<typeof controllerSettingsSchema>;
/** Legacy draft interpretation ONLY. Connected read views must use the actual raw mode. */
export function effectiveControllerMode(configuration: { controller?: ControllerSettings | undefined }): number {
  return configuration.controller?.mode ?? 3;
}
