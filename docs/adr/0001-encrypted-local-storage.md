# ADR-0001: Encrypted local storage

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

MyBaby is offline-first and will store child profile data and potentially sensitive or health-related feeding, sleep, growth, temperature, and medication records locally on iOS and Android. Ordinary SQLite relies on platform sandbox and device encryption but does not encrypt the database itself. Extracted app data, backups, unlocked devices, and compromised devices remain relevant threats.

Expo SDK 57 officially supports SQLCipher through `expo-sqlite` on iOS and Android, but SQLCipher is not available in Expo Go. Expo SecureStore provides OS-backed secret storage through iOS Keychain and Android Keystore-backed encrypted storage.

## Decision

1. The first real local production database will be SQLCipher-encrypted SQLite. MyBaby will not create a plaintext production database and plan a later migration.
2. A cryptographically random 256-bit database key will be generated and stored through Expo SecureStore. The key must not be stored in SQLite, AsyncStorage, source code, client-exposed environment variables, logs, crash reports, or analytics.
3. SQLCipher, SecureStore, and Expo remain in data/infrastructure. Domain and application layers receive only infrastructure-independent contracts and values.
4. Local SQLite is a reconstructable offline copy/cache of synchronized server data, not a backup mechanism.
5. The database and related sensitive cache files are excluded from OS/cloud backup by default. Unsynchronized local mutations can be lost if the device is lost before synchronization.
6. General field-level encryption is not part of the MVP unless a separate documented threat or requirement justifies it.
7. Logout, account deletion, child deletion, session loss, and family-access revocation require explicit secure-purge workflows. UI state changes alone do not constitute secure deletion.
8. A client that remains offline cannot learn about server-side revocation until it reconnects. This is an accepted limitation pending a defined offline authorization lease.
9. SQLCipher persistence work requires custom development builds and production builds; Expo Go is insufficient.

## Rationale

SQLCipher plus a SecureStore-held key provides defense in depth beyond platform sandboxing and device encryption, especially against raw database or backup extraction. It is proportionate to children's data and potential health data while retaining relational queries and offline-first behavior. Starting encrypted avoids a risky plaintext-to-encrypted production migration.

## Consequences

- Persistence initialization must retrieve or generate the key, open the database, apply the key before the first database operation, and verify successful access before migrations or repositories run.
- Key loss makes the local cache unreadable; recovery must safely discard and reconstruct it from authorized server data, subject to the unsynchronized-data policy.
- Platform backup exclusions must cover the database and companion files and must be verified on iOS and Android.
- Database/key purge must be coordinated with synchronization, deletion tombstones, account state, and membership state.
- SQLCipher configuration changes require rebuilding the native app. Persistence cannot be validated solely in Expo Go.
- Tests must cover incorrect or missing keys, restore behavior, secure purge, revocation after reconnect, and prevention of deleted data being reintroduced.

## Rejected or deferred alternatives

- **Plain SQLite with only OS protection:** rejected as the production baseline because the extracted database remains plaintext after platform protections are bypassed.
- **Plain SQLite first, encrypt later:** rejected because it creates sensitive plaintext data and requires a later production migration.
- **General field-level encryption:** deferred because it adds substantial query, index, synchronization, migration, and key-management complexity without a current separate threat that SQLCipher does not address.
- **Local database as backup:** rejected; server-side synchronized data and separately governed server backups are the recovery model.

## Open follow-up decisions

- maximum offline authorization lease/offline period;
- final family-access revocation policy;
- handling of unsynchronized mutations during logout;
- key rotation and SecureStore-key-loss recovery;
- optional app lock or biometric gating;
- rooted/jailbroken-device policy;
- detailed multi-account strategy;
- final iOS/Android backup and Expo CNG configuration;
- full restore, revocation, deletion, and key-loss test matrix.

These decisions must be made during the corresponding auth, sync, or persistence design and no later than production readiness.

## Sources

- [Expo SQLite, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
- [Expo SecureStore, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
- [Apple: Restricting keychain item accessibility](https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility)
- [Apple: Optimizing app data for iCloud Backup](https://developer.apple.com/documentation/foundation/optimizing-your-app-s-data-for-icloud-backup)
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)
- [Android Auto Backup](https://developer.android.com/identity/data/autobackup)
- [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/)
