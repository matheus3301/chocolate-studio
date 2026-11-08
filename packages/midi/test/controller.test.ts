import { describe, expect, it } from 'vitest';
import {
  createDefaultConfiguration, controllerModeSchema, effectiveControllerMode,
  exportConfiguration, importConfiguration, getControllerMode, studioConfigurationSchema,
} from '../src/index.js';

describe('controller settings persistence and draft compatibility', () => {
  it('round-trips known settings without inventing absent edit intent', () => {
    const configuration = createDefaultConfiguration();
    configuration.controller = { mode: 11, channelIndex: 15, interfaceType: 1, customCommandA: 133,
      interfaceCommand: 129, polarity: 1, bankMidi: 0, pcDisplay: 1, pcMaxGroupIndex: 31,
      ccMaxGroupIndex: 30, advancedMaxGroupIndex: 7, advancedGroupIndex: 6,
      keyboardGroupIndex: 5, mixGroupIndex: 4, visualA: 1 };
    const result = importConfiguration(exportConfiguration(configuration));
    expect(result).toEqual({ success: true, data: configuration });
    expect(configuration.controller).not.toHaveProperty('customCommandD');
    expect(effectiveControllerMode(configuration)).toBe(11);
  });

  it('retains unknown read mode through subsequent save, never becoming Advanced', () => {
    const configuration = createDefaultConfiguration();
    configuration.controller = { mode: 255, channelIndex: 3 };
    const result = importConfiguration(exportConfiguration(configuration));
    if (!result.success) throw new Error('Import failed');
    expect(effectiveControllerMode(result.data)).toBe(255);
    expect(getControllerMode(result.data.controller!.mode!)).toBeUndefined();
    expect(controllerModeSchema.safeParse(255).success).toBe(false);
  });

  it.each([1, 2])('keeps legacy format %i absent fields absent while interpreting its draft as Advanced', (formatVersion) => {
    const configuration = { ...createDefaultConfiguration(), formatVersion };
    const parsed = studioConfigurationSchema.parse(configuration);
    expect(parsed).not.toHaveProperty('controller');
    expect(effectiveControllerMode(parsed)).toBe(3);
    expect(importConfiguration(exportConfiguration(parsed))).toEqual({ success: true, data: parsed });
  });

  it.each([
    { mode: 256 }, { mode: -1 }, { mode: 0.5 }, { interfaceType: 2 }, { channelIndex: 16 },
    { visualA: 2 }, { customCommandD: 134 }, { interfaceCommand: 130 }, { pcMaxGroupIndex: 32 },
    { ccMaxGroupIndex: 32 }, { advancedMaxGroupIndex: 8 }, { advancedGroupIndex: 8 },
    { keyboardGroupIndex: 6 }, { mixGroupIndex: 6 }, { polarity: 2 }, { bankMidi: 2 }, { pcDisplay: 2 },
    { unknown: 0 },
  ])('rejects invalid scalar intent %#', (controller) => {
    expect(studioConfigurationSchema.safeParse({ ...createDefaultConfiguration(), controller }).success).toBe(false);
  });
});
