import * as Crypto from 'expo-crypto';
import type { MilestoneIdGenerator } from '../application/milestone';

export class ExpoMilestoneIdGenerator implements MilestoneIdGenerator {
  generate(): string { return Crypto.randomUUID(); }
}
