# Data Protection & Security Baseline

## Status and scope

This document is the mandatory technical baseline for MyBaby development involving user, child, health-related, authentication, media, notification, analytics, synchronization, or AI data. It applies to the mobile app, local storage, Supabase/PostgreSQL, Supabase Auth and Storage, server functions, integrations, and operational tooling.

MyBaby initially targets parents of children aged 0–12 months in Sweden. The product is expected to process information about children and may process health-related information. Children's personal data is particularly worthy of protection, and health data is a special category of personal data under GDPR. Whether a specific MyBaby data point legally constitutes health data depends on its content, purpose, and processing context; engineering therefore treats feeding, sleep, growth, temperature, and medication data conservatively as potential special-category data until a documented legal assessment says otherwise. See [IMY: Personuppgifter om barn](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/personuppgifter/personuppgifter-om-barn/).

> **This document is a technical governance model. It is not legal advice and is not a claim that MyBaby is GDPR-compliant.** Encryption, EU hosting, or use of Supabase do not by themselves establish legal compliance. The controller must make and document the legal decisions listed below before production processing begins.

## 1. Data classification

Every new field, event, file, log, API payload, and derived value must be classified before implementation.

| Class | Examples | Baseline rule |
| --- | --- | --- |
| Public | General knowledge articles | May be publicly readable only after content review |
| Internal | Feature flags, content versions | Not user-specific, but not public by default |
| Personal data | Email, account ID, child name, birth date | Requires a defined purpose, access control, and retention rule |
| Particularly sensitive | Child photos, family relationships, detailed daily history | Requires stronger local, cloud, logging, and deletion controls |
| Potential special-category health data | Growth, temperature, medication, feeding and sleep patterns | Treat as high-risk data until the legal classification and Article 9 basis are documented |
| Secret | AI keys, server keys, database credentials | Server environment only; never ship in the app or commit to Git |

Classification must be reviewed when data is reused for a new purpose. Combining ordinary data points may create sensitive inferences and must be assessed as a new processing activity.

## 2. Data minimization by MVP capability

Collect only data necessary for a documented product purpose. Optional data must remain optional in the domain model and UI.

| Capability | Minimum expected data | Constraints |
| --- | --- | --- |
| Account and authentication | Internal user ID, email, verification state, locale/settings | No personal identity number, address, or required legal name |
| Child profile | Opaque random `child_id`, display name or nickname, birth date | Sex, photo, birth time, birth weight, and birth length are optional; birth measurements may be health data |
| Family sharing | `child_id`, `user_id`, system role, membership state, created/revoked timestamps | No contact-list access; process only an explicitly entered invite destination if required |
| Feeding | Child ID, type, timestamp or start/end, optional amount | Avoid free-text notes in the initial model unless a specific need is approved |
| Sleep | Child ID, start and end timestamps | Calculate duration rather than storing a second canonical duration |
| Diapers | Child ID, timestamp, limited category | Avoid free text and unnecessary clinical detail |
| Growth | Child ID, measurement date, weight, length, head circumference as needed | Potential health data; units and validation must be explicit |
| Temperature | Child ID, timestamp, temperature, measurement method only if needed | Health and safety relevant; must not trigger unreviewed medical conclusions |
| Medication log | Child ID, product name, dose, unit, timestamp | High protection level; logging is not prescribing or medical advice |
| Vitamin D | Child ID, administered state and timestamp | Do not derive medical recommendations from the log |
| Milestones | Milestone type, date, optional short text and media | Photos and metadata are particularly sensitive |
| Reminders | Reminder type, schedule, enabled state | Lock-screen text must not expose child or health information by default |
| AI assistant | User question, minimum scoped context, response | Never send the full child history by default |
| Knowledge content | Locale, content version, source, review state | Must not contain user or child data |

### 2.1 Calculate instead of storing

Raw events should be canonical where possible. Calculate or reproducibly derive:

- current child age;
- feeding and sleep durations;
- latest feeding, diaper, or other event;
- daily and weekly totals;
- counts, averages, trends, chart values, and streaks;
- reminder due states;
- age-relevant content selection;
- AI summaries and request-specific context.

Derived values may be cached for performance, but caches must be invalidatable and must not become competing sources of truth. A derived value needs a separate review if it creates a new inference about a child.

### 2.2 Data not collected without a later documented need

MyBaby must not currently collect:

- Swedish personal identity numbers or equivalent national identifiers;
- a legal full name when a nickname is sufficient;
- exact home address;
- GPS location or continuous location history;
- the device contact list;
- the photo library beyond photos explicitly selected by the user;
- microphone or camera data without a direct user action;
- advertising identifiers;
- biometric or genetic data;
- diagnosis or medical-record documents;
- automatically imported healthcare records;
- BVC/healthcare-provider details without a concrete feature purpose;
- parent health data;
- unrestricted free text “for future use.”

Adding any item above requires a documented purpose, classification, data-flow update, legal review, threat-model update, retention decision, and approval before implementation.

## 3. Access model

`child_members` is the central authorization relationship:

```text
authenticated user
        |
        v
child_members(user_id, child_id, role, status)
        |
        v
child and child-scoped data
```

The baseline entities are expected to include `profiles`, `children`, `child_members`, and `child_invites`. Every child-scoped event must include at least an opaque identifier, `child_id`, `created_by`, and the timestamps/synchronization metadata required by its real use case. A `child_id` is an identifier, never a credential. Knowledge or guessing of an ID must provide no access.

### 3.1 Mandatory authorization rules

- Users may access only children for which they have an active, explicit `child_members` relationship.
- Row Level Security (RLS) is mandatory for every user, child, membership, event, reminder, media, and other personal-data table or view exposed through the Data API.
- Policies are default-deny and are defined separately for `select`, `insert`, `update`, and `delete`.
- Database grants and RLS are both restricted according to least privilege.
- Anonymous roles receive no user or child data access.
- The client UI is never the only security control.
- Every offline mutation is authorized again when received by the server.
- RLS requires automated positive and negative tests, including proof that user A cannot read or modify user B's child.
- Database functions, `SECURITY DEFINER` functions, and RPC permissions require separate review.

Supabase requires RLS and least-privilege grants for secure frontend Data API access. Secret and legacy service-role keys bypass RLS and are never safe to expose in a mobile client. See [Supabase: Securing your data](https://supabase.com/docs/guides/database/secure-data) and [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api).

### 3.2 Roles

Initial system roles are `owner` and `caregiver`. Do not add roles until a concrete permission difference exists. Do not use `guardian` or otherwise claim verified legal guardianship unless MyBaby implements and legally validates such verification. These roles describe application permissions only.

An authorization matrix must define each role's rights before RLS policies are written, including membership management, event editing/deletion, media access, export, child deletion, and ownership transfer.

### 3.3 Invitations

Family invitations must be time-limited, single-use, revocable, rate-limited, bound to a child and intended role, protected against enumeration, audit-logged without sensitive payloads, and stored as hashes rather than plaintext bearer tokens. Acceptance requires authentication and server-side authorization; a link alone must not permanently authorize a device or account.

## 4. Backend and secrets

The shipped application may contain only credentials explicitly designed to be public, such as a Supabase publishable key protected by RLS. The following must never be stored in the app bundle, Expo public environment variables, SQLite, AsyncStorage, logs, or Git:

- Supabase secret or legacy service-role keys;
- AI provider API keys;
- database passwords or connection strings;
- webhook secrets;
- private signing or encryption keys;
- administrative credentials.

Privileged operations must run on trusted backend infrastructure or server/Edge Functions. This includes AI calls, administrative membership changes, export and deletion orchestration, media processing, and operations requiring elevated credentials.

Every server operation must separately establish authentication (who is calling) and authorization (may that caller perform this operation for this child and resource). Server input must be schema-validated, length/range limited, and normalized. Client validation is user assistance, not a security boundary. Elevated clients must be isolated from user-session clients, and server secrets must be rotated after suspected exposure.

## 5. Local and offline data

The local-storage architecture is fixed by [ADR-0001: Encrypted local storage](../adr/0001-encrypted-local-storage.md):

- The first production database containing child or potentially health-related data must use SQLCipher through Expo SQLite. A plaintext production database must not be created as an intermediate architecture.
- The database key must be a cryptographically random 256-bit value stored through Expo SecureStore. It must never be stored in SQLite, AsyncStorage, source code, client-exposed environment variables, logs, crash reports, or analytics.
- SQLCipher, SecureStore, and Expo are data/infrastructure details. Domain and application code must not import or depend on them.
- Local SQLite is a reconstructable offline copy/cache of synchronized server data, not a backup or independent source of recovery.
- The database and related sensitive cache files are excluded from OS/cloud backup by default. Unsynchronized mutations may therefore be lost if the device is lost, damaged, or reset before synchronization.
- General field-level encryption is not added on top of SQLCipher in the MVP without a separately documented threat or requirement.
- Logout, account deletion, child deletion, session loss, and membership revocation require explicit secure-purge semantics. A UI logout alone must never be assumed to have securely removed local data.
- SQLCipher is unavailable in Expo Go. Persistence development and verification require development builds and production builds configured with SQLCipher.

Authentication tokens and other secrets must not be placed in ordinary SQLite or unprotected AsyncStorage. They require protected storage and a documented expiration, refresh, logout, deletion, and compromise lifecycle.

Revoking a member can stop future server access but cannot recover data already decrypted on an offline device. The app must purge local child data as soon as revocation is detected. This residual limitation must be included in the threat model and sharing design.

Synchronization queues are untrusted input. Server authorization, validation, idempotency, replay protection, ownership checks, and deletion/tombstone handling still apply after reconnect.

The following decisions remain open and must be resolved when the relevant authentication, synchronization, or persistence capability is designed, and no later than production readiness:

- maximum offline authorization lease/offline period;
- final family-access revocation policy;
- treatment of unsynchronized mutations during logout;
- database-key rotation;
- recovery after loss or invalidation of the SecureStore key;
- optional future app lock or biometric gate;
- rooted/jailbroken-device policy;
- detailed multi-account database and key strategy;
- final per-platform backup and CNG configuration;
- complete test matrix for backup/restore, revocation, key loss, deletion, and recovery.

Relevant platform requirements are documented by [Expo SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [Expo SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [Apple Keychain accessibility](https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility), [Apple backup exclusion](https://developer.apple.com/documentation/foundation/optimizing-your-app-s-data-for-icloud-backup), [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [Android Auto Backup](https://developer.android.com/identity/data/autobackup), and the [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/).

## 6. Transport, cloud, backup, and restore

- Use HTTPS/TLS for all network transport; no plaintext fallback is permitted.
- Prefer EU/EEA processing regions where available.
- Assess location separately for database, Storage, backups, logs, support access, analytics, AI, email, notifications, and subprocessors.
- Execute and review data processing agreements before production use.
- Identify and assess third-country transfers under GDPR Chapter V; EU primary hosting does not prove that no transfer or third-country access occurs.
- Define encryption at rest, access, retention, and deletion for every cloud service.
- Define backup frequency, retention, access, encryption, restore responsibility, and restoration tests.
- Exclude the local SQLCipher database and related sensitive cache files from device and cloud backups unless a later reviewed decision explicitly replaces the reconstructable-cache model.
- Restores must not silently reintroduce previously deleted records.
- Document backup aging and reapplication of deletion/tombstone records after restore.

See [EDPB Guidelines 05/2021 on international transfers](https://www.edpb.europa.eu/documents/guideline/guidelines-052021-on-the-interplay-between-the-application-of-article-3-and-the_en). Supabase states that database backups do not include Storage objects, so database and media backup/restore need separate designs. See [Supabase: Database overview](https://supabase.com/docs/guides/database/overview).

## 7. Logging, analytics, and crash reporting

The following are prohibited in app, server, CI, analytics, support, and crash logs:

- tokens, passwords, OTP values, and secrets;
- full user, child, event, or membership objects;
- child names, birth dates, photos, or media URLs;
- medication, temperature, growth, feeding, sleep, or other health values;
- unrestricted notes;
- AI prompts, responses, or retrieved child context;
- signed Storage URLs;
- raw request/response bodies containing personal data.

Logs may contain a minimal internal error code, module name, app/OS version, coarse performance data, and a non-identifying correlation ID where justified. Stable user or child identifiers must not be introduced for convenience.

Crash reporting and analytics require a separate review of provider, fields, SDK behavior, legal basis/consent where applicable, location, subprocessors, retention, deletion, and user controls before installation. Development logging follows the same restrictions.

## 8. AI baseline

- The mobile app never calls an external AI provider directly.
- The backend sends only the minimum data required for the request.
- Names, emails, photos, raw identifiers, and exact timestamps are removed or generalized unless strictly necessary.
- Deterministic questions such as total sleep or latest feeding are answered without AI.
- Full child history is never attached by default.
- Prompts and responses are not logged by default.
- AI output is not automatically written into canonical child data.
- AI does not diagnose, triage, prescribe, recommend medication, or replace professional care.
- Urgent safety messages and care escalation are deterministic, medically reviewed, and independent of free-form model output.
- The controlled, sourced, versioned knowledge base is separate from the model and UI translations.
- AI endpoints are authenticated, authorized, scoped, rate-limited, and abuse-monitored.

Before production, document the AI provider's DPA, subprocessors, geography, retention, deletion, training usage, security, incident handling, international-transfer mechanism, and allowed data classes. A provider must not receive identifiable or special-category child data merely because a user entered it in chat.

## 9. Data-subject rights, export, correction, and deletion

The architecture must support access/export, correction, and deletion without ad hoc database edits. Workflows must cover active databases, local devices, Storage, queues, derived data, AI data, applicable logs, and backup retention.

### 9.1 Account deletion

Before implementation, define what happens to the user profile and Auth identity, sessions/devices, memberships, events created for shared children, solely owned children, reminders, invitations, media, AI data, audit/security records, local copies, queued offline writes, and backups. Account deletion must not silently delete shared child data or leave a child without an accountable owner. Any grace period needs a documented purpose and duration.

### 9.2 Child deletion

Only an authorized role may initiate child deletion. Semantics must cover the child, events, growth and medication data, reminders, milestones, media, memberships, invitations, local copies, sync tombstones, server jobs, caches, exports, and backup aging. Deletion must be idempotent and resist offline clients re-uploading deleted records.

### 9.3 Family-sharing decisions

Resolve before final schema constraints and delete cascades:

- Can an owner leave without transferring ownership?
- Can a caregiver edit or delete another member's events?
- Who may delete the child resource?
- How are ownership disputes handled?
- What happens when one member requests deletion and another wants retention?
- How is membership removal distinguished from child-data deletion?
- How are requests made for the child by a parent or representative handled?

These are product, legal, and governance questions, not merely foreign-key behavior.

## 10. Security engineering baseline

Before any production backend processes user or child data, MyBaby requires:

- a documented threat model and data-flow inventory;
- an authorization matrix per role and operation;
- RLS and Storage-policy tests, including cross-account negative tests;
- rate limiting for authentication/reset, invitations, export, deletion, uploads, and AI;
- idempotency and replay protection for synchronization and privileged operations;
- explicit offline conflict and tombstone behavior;
- dependency and security review;
- secret scanning and rotation procedures;
- separate development, staging, and production environments;
- least-privilege administration and MFA for privileged accounts;
- security audit trails without sensitive payloads;
- an incident-response plan covering roles, escalation, containment, notification assessment, and evidence preservation;
- a tested backup/restore plan;
- a production security review.

Authentication and authorization remain separate. A valid session proves identity, not permission to access a child.

## 11. Media and Supabase Storage

Milestone media must use a private bucket with:

- Storage RLS based on active `child_members` authorization;
- no public object URLs;
- short-lived signed URLs where needed;
- allowlisted MIME types and content validation independent of extension;
- file-size and count limits;
- random, non-identifying object names;
- protection against path manipulation and overwrite;
- explicit image-processing rules;
- removal or documented handling of EXIF/GPS/device metadata;
- appropriate malware/content-safety assessment;
- deletion linked to child/media deletion;
- a separate Storage backup/restore assessment.

Supabase Storage uses RLS for object access. Service keys bypass it and must never be shared with clients. See [Supabase: Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## 12. Open legal and GDPR governance decisions

Engineering must not represent the following as resolved until the responsible organization has documented and approved them:

- identity of the data controller;
- data-subject and representative categories;
- purpose for every processing activity;
- Article 6 legal basis per purpose;
- applicable Article 9 exception for special-category data;
- a parent's or other user's authority to manage a child's data;
- transparency obligations;
- retention and erasure schedules;
- processor/subprocessor agreements;
- third-country transfers and safeguards;
- data-subject-rights procedures;
- breach assessment and notification responsibilities;
- whether a Data Protection Officer is required;
- DPIA necessity, scope, approval, and review;
- possible medical-device or sector-specific regulation;
- consumer, marketing, content, and health-information rules.

IMY states that legal basis must be established before data collection. Special-category processing also requires an applicable exception. See [IMY: Rättslig grund](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/) and [IMY: När får ni behandla känsliga personuppgifter?](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/personuppgifter/kansliga-personuppgifter/nar-far-ni-behandla-kansliga-personuppgifter/).

A formal DPIA screening is required before health-related tracking, family sharing, child media, analytics, or AI reaches production. Children, potential health data, systematic daily monitoring, sharing, and new technology are strong high-risk indicators. If processing is likely to result in high risk, a DPIA must be completed before processing starts and revisited as risks change. See [IMY: När ska en konsekvensbedömning genomföras?](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/konsekvensbedomning/nar-ska-en-konsekvensbedomning-genomforas/).

## 13. Launch markets

Sweden is the first launch market. Swedish law, IMY guidance, consumer rules, healthcare-information boundaries, and Swedish source content require review before release.

Denmark requires a separate launch review covering national law and regulator guidance, age/consent rules where relevant, consumer requirements, healthcare and emergency information, content sources, processor/data-transfer implications, language quality, and support. Swedish legal conclusions or medical/safety content are not automatically valid for Denmark.

## 14. Mandatory rules for the child domain model

1. A child is a separately protected resource, not an embedded object owned directly by one user.
2. All access derives from active `child_members` authorization.
3. Child identifiers are opaque identifiers, never security controls.
4. Initial roles are `owner` and `caregiver`; they do not assert legal guardianship.
5. Every child-scoped event includes `child_id` and `created_by` where applicable.
6. Optional profile fields remain nullable and are not requested without a feature purpose.
7. Free-text fields are excluded from the initial schema unless specifically approved.
8. Authorization and deletion semantics are decided before foreign keys/cascades are finalized.
9. Offline sync defines stable IDs, idempotency, conflicts, versions, and deletion tombstones before sensitive events are implemented.
10. RLS design and tests are part of each table's implementation, not postponed.
11. Temperature and medication are separate high-risk capabilities, not generic trackers.
12. Real child or health data is not persisted locally until encryption/key management is approved.
13. Push notifications support privacy-preserving lock-screen content from the start.
14. Membership revocation triggers local purge when detected and blocks all new server access.
15. AI remains outside the child core domain and receives data only through a narrow server-owned authorized interface.
16. Media is optional, private, separately authorized, and removable without orphaned objects.
17. Export, correction, account deletion, child deletion, and ownership transfer remain possible by design.

Any implementation that cannot satisfy this baseline must stop and document the unresolved risk and required decision before proceeding.
