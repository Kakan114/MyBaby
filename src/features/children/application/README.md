# Children application

This layer coordinates children use cases and defines the ports required from infrastructure. It may depend on `domain/`, while future `data/` implementations may depend on these contracts.

`ChildRepository` deliberately supports only saving and retrieving a child by ID. Missing children return `null`. Child IDs are supplied through the injected `ChildIdGenerator`; this layer does not select an infrastructure-specific ID mechanism or read system time.
