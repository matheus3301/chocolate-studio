import { z } from 'zod';
import { identifierSchema, midiDataByteSchema } from './messages.js';
import { safeJsonTreeSchema } from './safe-json.js';

const equipmentIdSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9.-]*$/)
  .refine((id) => !['constructor', 'prototype', '__proto__'].includes(id), 'Reserved identifier');
const versionSchema = z.string().max(32).regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/);
const textSchema = z.string().min(1).max(2048);
export const equipmentTextSchema = z.strictObject({ en: textSchema, 'pt-BR': textSchema });
export type EquipmentText = z.infer<typeof equipmentTextSchema>;
export type EquipmentLocale = 'en' | 'pt-BR';
export const equipmentProfileReferenceSchema = z.strictObject({ modelId: equipmentIdSchema, profileVersion: versionSchema });
export type EquipmentProfileReference = z.infer<typeof equipmentProfileReferenceSchema>;
export const equipmentActionParametersSchema = z.record(equipmentIdSchema, z.number().int().min(0).max(128))
  .refine((parameters) => Object.keys(parameters).length <= 8, 'Too many action parameters');
export type EquipmentActionParameters = z.infer<typeof equipmentActionParametersSchema>;
export const equipmentActionInvocationSchema = safeJsonTreeSchema.pipe(z.strictObject({
  ...equipmentProfileReferenceSchema.shape,
  actionId: equipmentIdSchema,
  parameters: equipmentActionParametersSchema,
  destinationId: identifierSchema,
}));
export type EquipmentActionInvocation = z.infer<typeof equipmentActionInvocationSchema>;

const idsSchema = z.array(equipmentIdSchema).max(16).refine((ids) => new Set(ids).size === ids.length, 'Duplicate reference');
const citationSchema = z.strictObject({
  sourceId: equipmentIdSchema,
  pdfPages: z.array(z.number().int().min(1).max(4096)).min(1).max(16)
    .refine((pages) => new Set(pages).size === pages.length, 'Duplicate PDF page'),
  section: textSchema,
});
const citationsSchema = z.array(citationSchema).min(1).max(16);
const sourceSchema = z.strictObject({
  id: equipmentIdSchema, publisher: textSchema, title: textSchema, revision: textSchema,
  url: z.string().max(2048).regex(/^https:\/\/[^\s]+$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
const parameterSchema = z.strictObject({
  type: z.literal('integer'), label: equipmentTextSchema,
  minimum: z.number().int().min(0).max(128), maximum: z.number().int().min(0).max(128),
  initial: z.number().int().min(0).max(128),
});
const valueSchema = z.union([
  z.strictObject({ constant: midiDataByteSchema }),
  z.strictObject({ parameter: equipmentIdSchema, offset: z.number().int().min(-128).max(128) }),
]);
const bindingMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('pc'), channel: z.literal('destination'), program: valueSchema }),
  z.strictObject({ type: z.literal('cc'), channel: z.literal('destination'), controller: midiDataByteSchema, value: valueSchema }),
]);
const hardwareVerificationSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('not-tested') }),
  z.strictObject({
    status: z.literal('destination-response-verified'),
    report: z.string().max(2048).regex(/^(https:\/\/[^\s]+|research\/[a-zA-Z0-9/._-]+\.md)$/),
    controllerModelId: equipmentIdSchema, destinationModelId: equipmentIdSchema,
    firmware: textSchema, observedResponse: textSchema,
  }),
]);
const actionSchema = z.strictObject({
  id: equipmentIdSchema, label: equipmentTextSchema, description: equipmentTextSchema,
  parameters: z.record(equipmentIdSchema, parameterSchema)
    .refine((parameters) => Object.keys(parameters).length <= 8, 'Too many action parameters'),
  messages: z.array(bindingMessageSchema).min(1).max(16),
  requirements: z.strictObject({ capabilities: idsSchema, setupIds: idsSchema }),
  citations: citationsSchema, hardwareVerification: hardwareVerificationSchema,
});
export type EquipmentAction = z.infer<typeof actionSchema>;
const profileShapeSchema = z.strictObject({
  kind: z.literal('destination-profile'), schemaVersion: z.literal(1),
  profileVersion: versionSchema, modelId: equipmentIdSchema,
  manufacturer: textSchema, model: textSchema, label: equipmentTextSchema,
  sources: z.array(sourceSchema).min(1).max(16),
  connection: z.strictObject({
    midiInputs: z.array(z.enum(['din5', 'usb-midi', 'ble-midi'])).min(1).max(3),
    midiOutputs: z.array(z.enum(['din5', 'usb-midi', 'ble-midi'])).max(3),
    directUsbMidi: z.boolean(), instructions: equipmentTextSchema, citations: citationsSchema,
  }),
  setup: z.array(z.strictObject({
    id: equipmentIdSchema, label: equipmentTextSchema, instructions: equipmentTextSchema, citations: citationsSchema,
  })).min(1).max(16),
  actions: z.array(actionSchema).min(1).max(64),
  unavailable: z.array(z.strictObject({
    id: equipmentIdSchema, label: equipmentTextSchema, description: equipmentTextSchema,
    reason: z.enum(['outside-pc-cc-design', 'not-documented']), requiredCapabilities: idsSchema, citations: citationsSchema,
  })).max(32),
}).superRefine((profile, ctx) => {
  const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });
  const unique = (items: { id: string }[], path: string) => {
    const ids = new Set<string>();
    items.forEach((item, index) => {
      if (ids.has(item.id)) issue('Duplicate identifier', [path, index, 'id']);
      ids.add(item.id);
    });
    return ids;
  };
  const sources = unique(profile.sources, 'sources');
  const setups = unique(profile.setup, 'setup');
  const actions = unique(profile.actions, 'actions');
  const unavailable = unique(profile.unavailable, 'unavailable');
  for (const id of unavailable) if (actions.has(id)) issue('Unavailable action is also assignable', ['unavailable']);
  const citations = (entries: z.infer<typeof citationsSchema>, path: (string | number)[]) => {
    entries.forEach((entry, i) => { if (!sources.has(entry.sourceId)) issue('Unresolved source', [...path, i, 'sourceId']); });
  };
  citations(profile.connection.citations, ['connection', 'citations']);
  if (profile.connection.directUsbMidi && !profile.connection.midiInputs.includes('usb-midi')) {
    issue('Direct USB MIDI requires a USB MIDI input', ['connection']);
  }
  for (const key of ['midiInputs', 'midiOutputs'] as const) {
    if (new Set(profile.connection[key]).size !== profile.connection[key].length) issue('Duplicate port', ['connection', key]);
  }
  profile.setup.forEach((entry, i) => citations(entry.citations, ['setup', i, 'citations']));
  profile.unavailable.forEach((entry, i) => citations(entry.citations, ['unavailable', i, 'citations']));
  profile.actions.forEach((action, i) => {
    const path = ['actions', i] as (string | number)[];
    citations(action.citations, [...path, 'citations']);
    if (action.hardwareVerification.status === 'destination-response-verified' &&
      action.hardwareVerification.destinationModelId !== profile.modelId) {
      issue('Hardware report model does not match profile', [...path, 'hardwareVerification']);
    }
    for (const id of action.requirements.setupIds) if (!setups.has(id)) issue('Unresolved setup requirement', [...path, 'requirements']);
    for (const [id, parameter] of Object.entries(action.parameters)) {
      if (parameter.minimum > parameter.initial || parameter.initial > parameter.maximum) {
        issue('Invalid parameter range or initial value', [...path, 'parameters', id]);
      }
    }
    action.messages.forEach((message, j) => {
      if (!action.requirements.capabilities.includes(`midi.${message.type}`)) {
        issue('Missing message capability requirement', [...path, 'requirements', 'capabilities']);
      }
      const value = message.type === 'pc' ? message.program : message.value;
      if ('parameter' in value) {
        const parameter = action.parameters[value.parameter];
        if (!parameter) issue('Unresolved binding parameter', [...path, 'messages', j]);
        else if (parameter.minimum + value.offset < 0 || parameter.maximum + value.offset > 127) {
          issue('Binding output exceeds MIDI data bounds', [...path, 'messages', j]);
        }
      }
    });
  });
});

/** Documentation and safe intent only; never grants controller or routing support. */
export const equipmentProfileSchema = safeJsonTreeSchema.pipe(profileShapeSchema);
export type EquipmentProfile = z.infer<typeof equipmentProfileSchema>;
