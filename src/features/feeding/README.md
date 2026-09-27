# Feeding feature

`feeding` documents the base feature boundaries:

```text
presentation -> application -> domain
                 ^
                 |
                data
```

- `presentation/` contains feature UI and presentation-specific hooks. It uses application use cases when they exist.
- `application/` is added only when orchestration or infrastructure ports are needed.
- `domain/` contains feeding business concepts and rules. It is framework-independent and must not import React, React Native, Expo, SQLite, or Supabase.
- `data/` contains implementations of application-owned infrastructure ports and data-source integrations.

No feeding functionality is implemented in this step. Add code only to the layer that needs it, and keep dependencies directed toward the domain.
