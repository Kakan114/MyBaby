import { randomUUID } from 'expo-crypto';

import type { SleepIdGenerator } from '../application/sleep-id-generator';

export class ExpoSleepIdGenerator implements SleepIdGenerator {
  generate(): string {
    return randomUUID();
  }
}
