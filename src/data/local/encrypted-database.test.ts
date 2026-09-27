import { describe, expect, it, vi } from 'vitest';

import type { DatabaseKey } from './database-key';
import {
  createSqlCipherKeyPragma,
  LocalDatabaseError,
  openEncryptedDatabase,
  type EncryptedDatabaseConnection,
} from './encrypted-database';

const key = 'ab'.repeat(32) as DatabaseKey;

function createConnection() {
  const calls: string[] = [];
  const connection: EncryptedDatabaseConnection = {
    execAsync: vi.fn(async (source: string) => {
      calls.push(source);
    }),
    getFirstAsync: async <T>(source: string): Promise<T | null> => {
      calls.push(source);
      return { count: 1 } as T;
    },
    closeAsync: vi.fn(async () => undefined),
  };

  return { calls, connection };
}

describe('encrypted database initialization', () => {
  it('constructs SQLCipher raw-key syntax only for a strict key', () => {
    expect(createSqlCipherKeyPragma(key)).toBe(`PRAGMA key = "x'${key}'";`);
    expect(() => createSqlCipherKeyPragma(`ab' OR 1=1 --`)).toThrow(LocalDatabaseError);
  });

  it('applies the key before verification and other initialization', async () => {
    const { calls, connection } = createConnection();

    await expect(
      openEncryptedDatabase({
        getDatabaseKey: async () => key,
        openDatabase: async () => connection,
      }),
    ).resolves.toBe(connection);

    expect(calls).toEqual([
      `PRAGMA key = "x'${key}'";`,
      'SELECT count(*) AS count FROM sqlite_master;',
      'PRAGMA foreign_keys = ON;',
    ]);
  });

  it('does not open the database when key access fails', async () => {
    const openDatabase = vi.fn();

    await expect(
      openEncryptedDatabase({
        getDatabaseKey: async () => {
          throw new Error('key unavailable');
        },
        openDatabase,
      }),
    ).rejects.toThrow('key unavailable');
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it('closes but never deletes a database that cannot be unlocked', async () => {
    const { connection } = createConnection();
    connection.getFirstAsync = vi.fn().mockRejectedValueOnce(
      new Error(`native failure containing ${key}`),
    );

    const error = await openEncryptedDatabase({
      getDatabaseKey: async () => key,
      openDatabase: async () => connection,
    }).catch((reason: unknown) => reason);

    expect(connection.closeAsync).toHaveBeenCalledOnce();
    expect(error).toMatchObject({ code: 'database-unlock-failed' });
    expect(String(error)).not.toContain(key);
  });
});
