import { candidateEvidence } from './candidate-codec.js';
import { ChocolateError, integerInRange } from './errors.js';
import { BinarySnapshot } from './snapshot.js';

/** Only the evidenced channel byte is editable; every other byte remains opaque. */
export class ConfigurationDraft {
  readonly state = 'draft' as const;
  readonly snapshot: BinarySnapshot;
  constructor(snapshot: BinarySnapshot) {
    if (snapshot.length !== candidateEvidence.configLength) {
      throw new ChocolateError('INVALID_ARGUMENT', { field: 'configurationLength', expected: candidateEvidence.configLength, actual: snapshot.length });
    }
    this.snapshot = snapshot;
    Object.freeze(this);
  }
  /** Stored channel 0..15; display 1..16 at the application boundary. */
  get channel(): number { return this.snapshot.at(2); }
  withChannel(channel: number): ConfigurationDraft {
    integerInRange(channel, 0, 15, 'channel');
    const bytes = this.snapshot.toUint8Array();
    bytes[2] = channel;
    return new ConfigurationDraft(new BinarySnapshot(bytes));
  }
}
