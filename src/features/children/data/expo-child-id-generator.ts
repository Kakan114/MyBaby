import { randomUUID } from 'expo-crypto';

import type { ChildIdGenerator } from '../application/child-id-generator';

export class ExpoChildIdGenerator implements ChildIdGenerator {
  generate(): string {
    return randomUUID();
  }
}
