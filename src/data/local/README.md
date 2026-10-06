# Encrypted local persistence foundation

MyBaby's local `mybaby.db` database uses SQLCipher. `openLocalDatabase()` obtains a 256-bit key from SecureStore, opens the database, applies the key before any read, verifies encrypted access, enables foreign-key enforcement, and applies pending product-schema migrations before returning the shared connection.

The application runtime lazily opens one encrypted connection and shares it between local repositories for its lifetime. `AppRuntime` owns closing that connection; repositories, React components, and routes do not open, close, or access SQLite directly.

The key is stored as exactly 64 lowercase hexadecimal characters. SecureStore uses the stable service `mybaby.local-database-key`; on iOS the item is configured as `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Platform backup exclusions and the final multi-account strategy remain open ADR follow-ups and are not implemented here.

SQLCipher is not available in Expo Go. This persistence path requires an iOS/Android development build or production build with the `expo-sqlite` config plugin and `useSQLCipher: true`.

Product-schema migrations use `PRAGMA user_version`, run sequentially in exclusive transactions, and advance the version only inside the successful transaction. Schema version 1 creates only the `children` table; version 2 adds the `active_child_selection` singleton; version 3 adds completed `feeding_events`; version 4 adds the single child-owned persisted breastfeeding-timer session. Child-owned rows use foreign keys with delete cascades. Migration never selects an arbitrary existing child. A newer unsupported version or any migration failure aborts initialization, closes the opened connection, and returns a sanitized error; the database is never automatically deleted or recreated.

Encrypted SQLite is canonical for the active-child preference; React is not. The first newly created child becomes active only when selection is unset. A future normal child deletion is covered by the foreign-key cascade, while conditional stale-reference recovery exists only as defensive integrity handling.

The synthetic `__mybaby_sqlcipher_verification` table remains outside the product schema and migrations. It belongs only to the development verification harness and is neither modified nor removed by product migrations.

Native verification must prove on physical iOS and Android development builds that:

- the database opens after app restart with the stored key;
- the file cannot be opened as plaintext SQLite;
- an incorrect or missing key fails without deleting the database;
- lock-state behavior matches the selected SecureStore accessibility;
- reinstall, backup/restore, and device-transfer behavior matches the eventual platform policy.

The hidden `__dev/sqlcipher` route provides a development-only verification harness. It is not linked from product navigation, redirects away in production, and its runner refuses to execute unless `__DEV__` is true. It uses only a synthetic marker and never displays encryption keys, SecureStore values, or native error details.
