# Children data

This layer contains runtime and future persistence adapters for children application contracts. It may depend on `application/` and `domain/`; neither inner layer may depend on this one.

`ExpoChildIdGenerator` produces cryptographically random UUIDv4 child identifiers through `expo-crypto`. Local calendar dates are built from the device runtime's local date fields rather than from a UTC timestamp.
