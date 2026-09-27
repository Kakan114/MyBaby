import { getRandomBytesAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DATABASE_KEY_STORAGE_KEY = 'mybaby.local-database-key.v1';
const DATABASE_KEY_SERVICE = 'mybaby.local-database-key';
const DATABASE_KEY_BYTE_LENGTH = 32;
const DATABASE_KEY_PATTERN = /^[0-9a-f]{64}$/;

declare const databaseKeyBrand: unique symbol;

export type DatabaseKey = string & {
  readonly [databaseKeyBrand]: true;
};

export type DatabaseKeyErrorCode =
  | 'secure-store-read-failed'
  | 'invalid-stored-key'
  | 'key-generation-failed'
  | 'secure-store-write-failed';

export class DatabaseKeyError extends Error {
  constructor(readonly code: DatabaseKeyErrorCode) {
    super(messageForCode(code));
    this.name = 'DatabaseKeyError';
  }
}

function messageForCode(code: DatabaseKeyErrorCode): string {
  switch (code) {
    case 'secure-store-read-failed':
      return 'Unable to read the local database encryption key.';
    case 'invalid-stored-key':
      return 'The stored local database encryption key has an invalid format.';
    case 'key-generation-failed':
      return 'Unable to generate a local database encryption key.';
    case 'secure-store-write-failed':
      return 'Unable to store the local database encryption key.';
  }
}

export function parseDatabaseKey(value: string): DatabaseKey {
  if (!DATABASE_KEY_PATTERN.test(value)) {
    throw new DatabaseKeyError('invalid-stored-key');
  }

  return value as DatabaseKey;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const readOptions: SecureStore.SecureStoreOptions = {
  keychainService: DATABASE_KEY_SERVICE,
};

const writeOptions: SecureStore.SecureStoreOptions = {
  ...readOptions,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function getOrCreateDatabaseKey(): Promise<DatabaseKey> {
  let storedKey: string | null;

  try {
    storedKey = await SecureStore.getItemAsync(DATABASE_KEY_STORAGE_KEY, readOptions);
  } catch {
    throw new DatabaseKeyError('secure-store-read-failed');
  }

  if (storedKey !== null) {
    return parseDatabaseKey(storedKey);
  }

  let generatedKey: DatabaseKey;

  try {
    const bytes = await getRandomBytesAsync(DATABASE_KEY_BYTE_LENGTH);

    if (bytes.length !== DATABASE_KEY_BYTE_LENGTH) {
      throw new Error('Unexpected random byte length.');
    }

    generatedKey = parseDatabaseKey(bytesToHex(bytes));
  } catch {
    throw new DatabaseKeyError('key-generation-failed');
  }

  try {
    await SecureStore.setItemAsync(DATABASE_KEY_STORAGE_KEY, generatedKey, writeOptions);
  } catch {
    throw new DatabaseKeyError('secure-store-write-failed');
  }

  return generatedKey;
}
