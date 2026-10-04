# Children application

This layer coordinates children use cases and defines the ports required from infrastructure. It may depend on `domain/`, while future `data/` implementations may depend on these contracts.

`ChildRepository` deliberately supports only saving, retrieving a child by ID, and checking whether any child exists. The existence capability supports bootstrap without introducing child listing or counting. Saving an existing ID updates that child, and missing children return `null`. Child IDs are supplied through the injected `ChildIdGenerator`; this layer does not select an infrastructure-specific ID mechanism or read system time.

Active-child selection is an application-owned local preference. `getActiveChild` resolves the persisted ID through `ChildRepository` and conditionally clears only an unexpected stale reference. `setActiveChild` validates that the child exists and reports the stable `child-not-found` application error otherwise. Creating the first new child sets it active only while the selection is unset; later creation does not replace an existing selection.

Children bootstrap has exactly three application states: `ready`, `onboarding-required`, and `active-selection-required`. The decision first reuses `getActiveChild`; a null active child triggers a separate existence check and does not by itself imply onboarding. The deterministic create-child use case still receives an explicit reference date, while the runtime supplies the current local calendar date to its future UI-facing operation. React bootstrap and routing remain deferred.
