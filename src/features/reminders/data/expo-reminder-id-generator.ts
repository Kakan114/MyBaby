import * as Crypto from 'expo-crypto';
import type { ReminderIdGenerator } from '../application/reminder';

export class ExpoReminderIdGenerator implements ReminderIdGenerator {
  generate(): string { return Crypto.randomUUID(); }
}
