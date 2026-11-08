import type { z } from 'zod';
import { CONFIGURATION_LIMITS, studioConfigurationSchema } from './configuration.js';
import type { StudioConfiguration } from './configuration.js';

export type ConfigurationImportError =
  | { code: 'size'; message: string }
  | { code: 'syntax'; message: string }
  | { code: 'validation'; message: string; issues: z.core.$ZodIssue[] };
export type ConfigurationImportResult =
  | { success: true; data: StudioConfiguration }
  | { success: false; error: ConfigurationImportError };
const encoder = new TextEncoder();

export function importConfiguration(json: string): ConfigurationImportResult {
  if (typeof json !== 'string') {
    return { success: false, error: { code: 'syntax', message: 'Expected JSON text' } };
  }
  if (json.length > CONFIGURATION_LIMITS.jsonBytes || encoder.encode(json).byteLength > CONFIGURATION_LIMITS.jsonBytes) {
    return { success: false, error: { code: 'size', message: 'Configuration JSON exceeds byte limit' } };
  }
  let input: unknown;
  try {
    input = JSON.parse(json) as unknown;
  } catch {
    return { success: false, error: { code: 'syntax', message: 'Invalid JSON' } };
  }
  const result = studioConfigurationSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: { code: 'validation', message: 'Invalid configuration', issues: result.error.issues } };
}

/** Canonical key ordering; array/message order and user Unicode remain unchanged. */
export function exportConfiguration(configuration: StudioConfiguration): string {
  const validated = studioConfigurationSchema.parse(configuration);
  const json = JSON.stringify(validated, (_key, value: unknown) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    }
    return value;
  }, 2) + '\n';
  if (encoder.encode(json).byteLength > CONFIGURATION_LIMITS.jsonBytes) {
    throw new RangeError('Configuration JSON exceeds byte limit');
  }
  return json;
}
