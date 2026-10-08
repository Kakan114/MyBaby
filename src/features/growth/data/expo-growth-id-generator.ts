import * as Crypto from 'expo-crypto';
import type { GrowthIdGenerator } from '../application/growth';

export class ExpoGrowthIdGenerator implements GrowthIdGenerator {
  generate(): string { return Crypto.randomUUID(); }
}
