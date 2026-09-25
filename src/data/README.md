# Shared data infrastructure

- `local/`: the offline-first SQLite data source.
- `remote/`: Supabase-backed data sources.
- `sync/`: synchronization, queues, conflict handling, and connectivity coordination.

Feature code reaches shared data infrastructure through domain repository contracts. UI and route files must not call SQLite or Supabase directly.
