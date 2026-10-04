# Children data

This layer contains runtime and future persistence adapters for children application contracts. It may depend on `application/` and `domain/`; neither inner layer may depend on this one.

`ExpoChildIdGenerator` produces cryptographically random UUIDv4 child identifiers through `expo-crypto`. Local calendar dates are built from the device runtime's local date fields rather than from a UTC timestamp.

`SqliteChildRepository` implements the application-owned `ChildRepository` port. It receives an already opened, encrypted, and migrated database connection from shared local-data infrastructure; it does not own the connection, key handling, or migrations. Database rows map `date_of_birth` directly to the domain `CalendarDate` in `YYYY-MM-DD` form, saving uses an ID-based upsert of only the three existing Child fields, and bootstrap existence checks select at most one constant rather than counting or listing children.

`SqliteActiveChildRepository` persists the application-owned active-child preference in the same encrypted database. Its conflict-safe default does not overwrite an established selection, and stale cleanup is conditional so it cannot erase a newer selection. The repository does not own the shared connection or cache selection state in memory.
