import * as Crypto from 'expo-crypto';

import type { DiaperIdGenerator } from '../application/diaper-id-generator';

export class ExpoDiaperIdGenerator implements DiaperIdGenerator {
  generate(): string {
    return Crypto.randomUUID();
  }
}
