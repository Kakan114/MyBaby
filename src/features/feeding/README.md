# Feeding feature

`feeding` follows the project feature boundaries:

```text
presentation -> application -> domain
                 ^
                 |
                data
```

- `presentation/` owns the completed-feeding form and converts user-facing minutes to domain seconds. It never accesses SQLite.
- `application/` owns the repository and ID-generator ports plus the record-feeding use case.
- `domain/` contains feeding business concepts and rules. It is framework-independent and must not import React, React Native, Expo, SQLite, or Supabase.
- `data/` contains implementations of application-owned infrastructure ports and data-source integrations.

The first slice records completed breast or bottle feedings for the active child. History, timers, editing, deletion, statistics, sync, and manual timestamps remain outside this contract.
