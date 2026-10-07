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
import { initializeLocalDatabase, openLocalDatabase } from './open-local-database';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { getItemAsync, setItemAsync } from 'expo-secure-store';

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

function currentConnection(calls: string[]) {
  const connection = createConnection(calls);
  connection.getFirstAsync = async <T>(source: string): Promise<T | null> => {
    calls.push(source);
    return (source === 'PRAGMA user_version;' ? { user_version: 6 } : { count: 1 }) as T;
  };
  return connection;
}

describe('central connection isolation', () => {
  it('opens the existing file independently and initializes every connection', async () => {
    vi.mocked(getItemAsync).mockResolvedValue(key);
    vi.mocked(setItemAsync).mockClear();
    vi.mocked(openDatabaseAsync).mockReset();
    const calls = [[], []] as string[][];
    const connections = calls.map(currentConnection);
    for (const connection of connections) {
      vi.mocked(openDatabaseAsync).mockResolvedValueOnce(connection as SQLiteDatabase);
    }
    for (const connection of connections) await expect(openLocalDatabase()).resolves.toBe(connection);
    expect(openDatabaseAsync).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(openDatabaseAsync).mock.calls) {
      expect(call).toEqual(['mybaby.db', { useNewConnection: true }]);
    }
    for (const statements of calls) expect(statements).toEqual([
      `PRAGMA key = "x'${key}'";`,
      'SELECT count(*) AS count FROM sqlite_master;',
      'PRAGMA foreign_keys = ON;',
      'PRAGMA user_version;',
    ]);
    expect(setItemAsync).not.toHaveBeenCalled();
    for (const connection of connections) expect(connection.closeAsync).not.toHaveBeenCalled();
  });

  it.each(['unlock', 'migration'])('closes only its own connection after %s failure', async phase => {
    vi.mocked(getItemAsync).mockResolvedValue(key);
    vi.mocked(openDatabaseAsync).mockReset();
    const first = currentConnection([]);
    const failed = currentConnection([]);
    failed.getFirstAsync = async <T>(source: string): Promise<T | null> => {
      if (phase === 'unlock' || source === 'PRAGMA user_version;') throw new Error('sensitive native failure');
      return { count: 1 } as T;
    };
    vi.mocked(openDatabaseAsync).mockResolvedValueOnce(first as SQLiteDatabase)
      .mockResolvedValueOnce(failed as SQLiteDatabase);
    await openLocalDatabase();
    const error = await openLocalDatabase().catch(error => error);
    expect(error).toMatchObject({ code: phase === 'unlock' ? 'database-unlock-failed' : 'migration-failed' });
    expect(String(error)).not.toContain('sensitive');
    expect(failed.closeAsync).toHaveBeenCalledOnce();
    expect(first.closeAsync).not.toHaveBeenCalled();
  });

  it.each(['database is busy', 'database is locked'])('sanitizes %s during opening without retry', async message => {
    vi.mocked(getItemAsync).mockResolvedValue(key);
    vi.mocked(openDatabaseAsync).mockReset().mockRejectedValueOnce(new Error(message));
    const error = await openLocalDatabase().catch(error => error);
    expect(error).toMatchObject({ code: 'database-open-failed' });
    expect(String(error)).not.toContain(message);
    expect(openDatabaseAsync).toHaveBeenCalledOnce();
  });
});
