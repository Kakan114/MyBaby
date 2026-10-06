import * as Crypto from 'expo-crypto';

import type { FeedingIdGenerator } from '../application/feeding-id-generator';

export class ExpoFeedingIdGenerator implements FeedingIdGenerator {
  generate(): string {
    return Crypto.randomUUID();
  }
}
