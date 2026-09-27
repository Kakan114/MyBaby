import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  getRandomBytesAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: native.getItemAsync,
  setItemAsync: native.setItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: native.getRandomBytesAsync,
}));

import {
  DatabaseKeyError,
  getOrCreateDatabaseKey,
  parseDatabaseKey,
} from './database-key';

const existingKey = 'ab'.repeat(32);

describe('database key management', () => {
  beforeEach(() => {
    native.getItemAsync.mockReset();
    native.setItemAsync.mockReset();
    native.getRandomBytesAsync.mockReset();
  });

  it('reuses a valid key from SecureStore', async () => {
    native.getItemAsync.mockResolvedValue(existingKey);

    await expect(getOrCreateDatabaseKey()).resolves.toBe(existingKey);
    expect(native.getRandomBytesAsync).not.toHaveBeenCalled();
    expect(native.setItemAsync).not.toHaveBeenCalled();
  });

  it('generates and stores a missing 256-bit key as lowercase hexadecimal', async () => {
    native.getItemAsync.mockResolvedValue(null);
    native.getRandomBytesAsync.mockResolvedValue(Uint8Array.from({ length: 32 }, (_, i) => i));
    native.setItemAsync.mockResolvedValue(undefined);

    const key = await getOrCreateDatabaseKey();

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(native.getRandomBytesAsync).toHaveBeenCalledWith(32);
    expect(native.setItemAsync).toHaveBeenCalledWith(
      'mybaby.local-database-key.v1',
      key,
      expect.objectContaining({
        keychainService: 'mybaby.local-database-key',
        keychainAccessible: 1,
      }),
    );
  });

  it('rejects stored keys outside the strict format', async () => {
    native.getItemAsync.mockResolvedValue('not-a-valid-key');

    await expect(getOrCreateDatabaseKey()).rejects.toMatchObject({
      code: 'invalid-stored-key',
    });
    expect(native.setItemAsync).not.toHaveBeenCalled();
  });

  it('rejects uppercase hexadecimal keys', () => {
    expect(() => parseDatabaseKey('AB'.repeat(32))).toThrow(DatabaseKeyError);
  });

  it('propagates SecureStore read failures without exposing the native message', async () => {
    native.getItemAsync.mockRejectedValue(new Error(`native failure containing ${existingKey}`));

    const error = await getOrCreateDatabaseKey().catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'secure-store-read-failed' });
    expect(String(error)).not.toContain(existingKey);
  });

  it('reports random generation failures without exposing the native message', async () => {
    native.getItemAsync.mockResolvedValue(null);
    native.getRandomBytesAsync.mockRejectedValue(
      new Error(`native failure containing ${existingKey}`),
    );

    const error = await getOrCreateDatabaseKey().catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'key-generation-failed' });
    expect(String(error)).not.toContain(existingKey);
    expect(native.setItemAsync).not.toHaveBeenCalled();
  });

  it('reports SecureStore write failures without exposing the generated key', async () => {
    native.getItemAsync.mockResolvedValue(null);
    native.getRandomBytesAsync.mockResolvedValue(new Uint8Array(32).fill(171));
    native.setItemAsync.mockRejectedValue(new Error(`native failure containing ${existingKey}`));

    const error = await getOrCreateDatabaseKey().catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'secure-store-write-failed' });
    expect(String(error)).not.toContain(existingKey);
  });
});
