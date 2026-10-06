# Feeding feature

`feeding` follows the project feature boundaries:

```text
presentation -> application -> domain
                 ^
                 |
                data
```

- `presentation/` owns the completed-feeding form, recent-history screen, and persisted breastfeeding-timer projection. UI ticks only redraw elapsed time; they never mutate canonical duration or access SQLite.
- `application/` owns the completed-feeding/history and timer repository ports, the injected epoch clock, and their use cases. Recent history has a product-owned limit of 20 events.
- `domain/` contains feeding business concepts and rules. It is framework-independent and must not import React, React Native, Expo, SQLite, or Supabase.
- `data/` contains implementations of application-owned infrastructure ports and data-source integrations.

Completed breast or bottle feedings belong to the active child. Breastfeeding primarily uses a persistent start/pause/switch/finish timer; manual breast entry remains secondary and bottle entry is unchanged. Recent history resolves the current active child at load time and never accepts a child ID from presentation. Pagination, editing, deletion, statistics, sync, and manual timestamps remain outside this contract.

`AppRuntime` serializes recent-history reads, ordinary completed-feeding writes, discard, and timer completion so a history query cannot enter an open timer transaction on the shared encrypted connection.
