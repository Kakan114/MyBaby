# Children application

This layer coordinates children use cases and defines the ports required from infrastructure. It may depend on `domain/`, while future `data/` implementations may depend on these contracts.

`ChildRepository` deliberately supports only saving and retrieving a child by ID. Saving an existing ID updates that child, and missing children return `null`. Child IDs are supplied through the injected `ChildIdGenerator`; this layer does not select an infrastructure-specific ID mechanism or read system time.

Active-child selection is an application-owned local preference. `getActiveChild` resolves the persisted ID through `ChildRepository` and conditionally clears only an unexpected stale reference. `setActiveChild` validates that the child exists and reports the stable `child-not-found` application error otherwise. Creating the first new child sets it active only while the selection is unset; later creation does not replace an existing selection.
