# Feeding feature

`feeding` follows the project feature boundaries:

```text
presentation -> application -> domain
                 ^
                 |
                data
```

- `presentation/` owns the completed-feeding form and persisted breastfeeding-timer projection. UI ticks only redraw elapsed time; they never mutate canonical duration or access SQLite.
- `application/` owns the completed-feeding and timer repository ports, the injected epoch clock, and their use cases.
- `domain/` contains feeding business concepts and rules. It is framework-independent and must not import React, React Native, Expo, SQLite, or Supabase.
- `data/` contains implementations of application-owned infrastructure ports and data-source integrations.

Completed breast or bottle feedings belong to the active child. Breastfeeding primarily uses a persistent start/pause/switch/finish timer; manual breast entry remains secondary and bottle entry is unchanged. History, editing, deletion, statistics, sync, and manual timestamps remain outside this contract.

`AppRuntime` serializes ordinary completed-feeding writes with timer completion so no unrelated write can enter the timer's transaction on the shared encrypted connection.
