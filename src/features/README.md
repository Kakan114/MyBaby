# Feature modules

Each product feature belongs in its own folder. A feature adds these layers when needed:

- `presentation/`: screens, feature-specific components, and hooks.
- `domain/`: business rules, use cases, entities, and repository contracts.
- `data/`: implementations connecting the feature to local or remote data sources.

Dependencies flow inward: presentation may use domain, and data may implement domain contracts. Domain code must not import React Native, Expo, SQLite, or Supabase.

`feeding/` is the reference feature for this structure. It contains the three layer folders and documents their boundaries, but intentionally has no feature behavior yet. Future features should follow the same dependency direction without copying files that they do not need.

The remaining feature folders created in Step 18.1 are neutral placeholders. No feature behavior is implemented yet.
