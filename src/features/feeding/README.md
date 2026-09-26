# Feeding feature

`feeding` is the reference feature for the feature-based three-layer architecture:

```text
presentation -> domain <- data
```

- `presentation/` contains feature UI and presentation-specific hooks. It may use `domain/`.
- `domain/` contains feeding business concepts, use cases, and repository contracts. It is framework-independent and must not import React, React Native, Expo, SQLite, or Supabase.
- `data/` contains implementations of domain contracts and integrations with data sources.

No feeding functionality is implemented in this step. Add code only to the layer that needs it, and keep dependencies directed toward the domain.
