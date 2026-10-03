import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn() }));
vi.mock('expo-crypto', () => ({ getRandomBytesAsync: vi.fn() }));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

import type { DatabaseKey } from './database-key';
import type { LocalDatabaseConnection } from './open-local-database';
import { initializeLocalDatabase } from './open-local-database';

const key = 'ab'.repeat(32) as DatabaseKey;

function createConnection(calls: string[]): LocalDatabaseConnection {
  return {
    execAsync: async (source) => {
      calls.push(source);
    },
    getFirstAsync: async <T>(source: string): Promise<T | null> => {
      calls.push(source);
      return { count: 1 } as T;
    },
    closeAsync: vi.fn(async () => undefined),
    withExclusiveTransactionAsync: vi.fn(),
  };
}

describe('local database initialization', () => {
  it('runs product migrations only after encrypted initialization', async () => {
    const calls: string[] = [];
    const connection = createConnection(calls);

    await expect(
      initializeLocalDatabase({
        getDatabaseKey: async () => key,
        openDatabase: async () => connection,
        migrateDatabase: async () => {
          calls.push('migrate');
        },
      }),
    ).resolves.toBe(connection);

    expect(calls).toEqual([
      `PRAGMA key = "x'${key}'";`,
      'SELECT count(*) AS count FROM sqlite_master;',
      'PRAGMA foreign_keys = ON;',
      'migrate',
    ]);
  });

  it('closes an opened connection and sanitizes migration failures', async () => {
    const connection = createConnection([]);

    const error = await initializeLocalDatabase({
      getDatabaseKey: async () => key,
      openDatabase: async () => connection,
      migrateDatabase: async () => {
        throw new Error('native migration error with sensitive details');
      },
    }).catch((reason: unknown) => reason);

    expect(connection.closeAsync).toHaveBeenCalledOnce();
    expect(error).toMatchObject({ code: 'migration-failed' });
    expect(String(error)).not.toContain('sensitive details');
  });
});
