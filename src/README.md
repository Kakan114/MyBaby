# Source architecture

MyBaby uses feature-based modules with an inward dependency direction. Add code where it is owned today; do not create abstractions or shared modules for hypothetical reuse.

## Directory ownership

- `app/` contains thin Expo Router routes. Routes may compose features, but must not contain business logic or access databases directly.
- `features/*/` owns feature-specific presentation, application, domain, and data code as needed. See `features/README.md` and the documented feature structures.
- `components/` contains only generic, reusable UI components that do not belong to a feature.
- `data/local/`, `data/remote/`, and `data/sync/` are shared infrastructure boundaries for SQLite, Supabase, and synchronization. They are not implemented yet.
- `services/` contains app-wide integrations such as authentication, notifications, and AI. Feature-specific business logic does not belong there.
- `types/` contains only genuinely app-wide TypeScript types. Feature models belong in that feature's domain layer.
- `utils/` contains pure, generic helpers without feature-specific business rules.
- `i18n/` owns internationalization infrastructure and future translation resources.
- `theme/` owns design tokens and the shared design system, which will be implemented in Step 19.

## Dependency rules

- Routes may compose features through their intended public APIs. Code outside a feature must not reach into its internal implementation.
- A feature must not import another feature's internal implementation. If features need to collaborate, expose a small explicit public contract. Move code to a shared module only after a real reuse need exists.
- Within a feature, presentation may depend on application, application may depend on domain, and data may implement application-owned infrastructure contracts. Domain must not depend on application, presentation, or data.
- Domain code must remain framework-independent. It must not import React, React Native, Expo, SQLite, Supabase, or other infrastructure libraries.
- Shared data infrastructure and app-wide services must not become homes for feature-specific business logic.
- Avoid circular dependencies. Prefer direct imports; add a barrel (`index.ts`) only when it defines a deliberate public API, not by default.

## Data protection and security

Development involving user, child, health-related, media, authentication, or other sensitive data must follow [`docs/security/data-protection-security-baseline.md`](../docs/security/data-protection-security-baseline.md).
