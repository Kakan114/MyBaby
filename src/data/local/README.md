# Encrypted local persistence foundation

MyBaby's first real local database must use SQLCipher. `openLocalDatabase()` obtains a 256-bit key from SecureStore, opens the database, applies the key before any read, verification, initialization, migration, or repository operation, verifies access, and then enables foreign-key enforcement.

The key is stored as exactly 64 lowercase hexadecimal characters. SecureStore uses the stable service `mybaby.local-database-key`; on iOS the item is configured as `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Platform backup exclusions and the final multi-account strategy remain open ADR follow-ups and are not implemented here.

SQLCipher is not available in Expo Go. This persistence path requires an iOS/Android development build or production build with the `expo-sqlite` config plugin and `useSQLCipher: true`.

No product schema, migrations, repositories, synchronization, or secure-purge behavior exists yet. Native verification must prove on physical iOS and Android development builds that:

- the database opens after app restart with the stored key;
- the file cannot be opened as plaintext SQLite;
- an incorrect or missing key fails without deleting the database;
- lock-state behavior matches the selected SecureStore accessibility;
- reinstall, backup/restore, and device-transfer behavior matches the eventual platform policy.

The hidden `__dev/sqlcipher` route provides a development-only verification harness. It is not linked from product navigation, redirects away in production, and its runner refuses to execute unless `__DEV__` is true. It uses only a synthetic marker and never displays encryption keys, SecureStore values, or native error details.
