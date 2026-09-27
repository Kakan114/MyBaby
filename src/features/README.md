# Feature modules

Each product feature belongs in its own folder. A feature adds these layers when needed:

- `presentation/`: screens, feature-specific components, and hooks.
- `application/`: use cases and ports required from infrastructure, when orchestration is needed.
- `domain/`: entities and pure business rules.
- `data/`: implementations connecting application ports to local or remote data sources.

Dependencies flow inward: `presentation -> application -> domain`, while data implements application-owned ports. Domain code must not import React Native, Expo, SQLite, or Supabase.

`feeding/` documents the presentation, domain, and data boundaries without implementing behavior. `children/` also demonstrates an application boundary where use-case orchestration is needed. Future features should follow the same dependency direction without copying layers or files they do not need.

The remaining feature folders created in Step 18.1 are neutral placeholders. No feature behavior is implemented yet.
