import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { getOrCreateDatabaseKey, parseDatabaseKey } from '../database-key';
import { createSqlCipherKeyPragma } from '../encrypted-database';
import { LOCAL_DATABASE_NAME, openLocalDatabase } from '../open-local-database';

const VERIFICATION_MARKER = 'synthetic-sqlcipher-marker-v1';
const VERIFICATION_TABLE = '__mybaby_sqlcipher_verification';

export type SqlCipherVerificationResult = Readonly<{
  cipherVersion: string;
  databaseOpened: true;
  markerPersistedAfterReopen: true;
  markerWrittenAndRead: true;
  wrongKeyRejected: true;
  databasePreservedAfterWrongKey: true;
}>;

export type SqlCipherVerificationErrorCode =
  | 'development-only'
  | 'cipher-version-missing'
  | 'marker-verification-failed'
  | 'wrong-key-was-accepted'
  | 'verification-failed';

export class SqlCipherVerificationError extends Error {
  constructor(readonly code: SqlCipherVerificationErrorCode) {
    super('SQLCipher development verification failed.');
    this.name = 'SqlCipherVerificationError';
  }
}

type CipherVersionRow = { cipher_version: string };
type MarkerRow = { marker: string };

async function closeWithoutMaskingFailure(database: SQLiteDatabase | null): Promise<void> {
  if (database === null) {
    return;
  }

  try {
    await database.closeAsync();
  } catch {
    // A close failure must not expose native details or trigger destructive recovery.
  }
}

async function readMarker(database: SQLiteDatabase): Promise<string | null> {
  const row = await database.getFirstAsync<MarkerRow>(
    `SELECT marker FROM ${VERIFICATION_TABLE} WHERE id = 1;`,
  );

  return row?.marker ?? null;
}

function createDefinitelyDifferentKey(realKey: string) {
  const replacement = realKey[0] === '0' ? '1' : '0';
  return parseDatabaseKey(`${replacement}${realKey.slice(1)}`);
}

export async function runSqlCipherDevelopmentVerification(): Promise<SqlCipherVerificationResult> {
  if (!__DEV__) {
    throw new SqlCipherVerificationError('development-only');
  }

  let database: SQLiteDatabase | null = null;

  try {
    database = await openLocalDatabase();

    const cipher = await database.getFirstAsync<CipherVersionRow>('PRAGMA cipher_version;');
    if (typeof cipher?.cipher_version !== 'string' || cipher.cipher_version.length === 0) {
      throw new SqlCipherVerificationError('cipher-version-missing');
    }

    await database.execAsync(
      `CREATE TABLE IF NOT EXISTS ${VERIFICATION_TABLE} (` +
        'id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), ' +
        'marker TEXT NOT NULL' +
        ');',
    );
    await database.runAsync(
      `INSERT OR REPLACE INTO ${VERIFICATION_TABLE} (id, marker) VALUES (1, ?);`,
      VERIFICATION_MARKER,
    );

    if ((await readMarker(database)) !== VERIFICATION_MARKER) {
      throw new SqlCipherVerificationError('marker-verification-failed');
    }

    await database.closeAsync();
    database = null;

    database = await openLocalDatabase();
    if ((await readMarker(database)) !== VERIFICATION_MARKER) {
      throw new SqlCipherVerificationError('marker-verification-failed');
    }
    await database.closeAsync();
    database = null;

    const realKey = await getOrCreateDatabaseKey();
    const wrongKey = createDefinitelyDifferentKey(realKey);
    let wrongKeyDatabase: SQLiteDatabase | null = null;
    let wrongKeyRejected = false;

    try {
      wrongKeyDatabase = await openDatabaseAsync(LOCAL_DATABASE_NAME);
      await wrongKeyDatabase.execAsync(createSqlCipherKeyPragma(wrongKey));
      await readMarker(wrongKeyDatabase);
    } catch {
      wrongKeyRejected = true;
    } finally {
      await closeWithoutMaskingFailure(wrongKeyDatabase);
    }

    if (!wrongKeyRejected) {
      throw new SqlCipherVerificationError('wrong-key-was-accepted');
    }

    database = await openLocalDatabase();
    if ((await readMarker(database)) !== VERIFICATION_MARKER) {
      throw new SqlCipherVerificationError('marker-verification-failed');
    }

    await database.closeAsync();
    database = null;

    return {
      cipherVersion: cipher.cipher_version,
      databaseOpened: true,
      markerWrittenAndRead: true,
      markerPersistedAfterReopen: true,
      wrongKeyRejected: true,
      databasePreservedAfterWrongKey: true,
    };
  } catch (error) {
    await closeWithoutMaskingFailure(database);

    if (error instanceof SqlCipherVerificationError) {
      throw error;
    }

    throw new SqlCipherVerificationError('verification-failed');
  }
}
