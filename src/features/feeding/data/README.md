# Feeding data

`SqliteFeedingRepository` implements the application-owned port on the shared encrypted database connection. It binds every value and maps the union to mutually exclusive nullable columns. Recording inserts a new event; an ID collision fails instead of replacing or mutating an existing event. Recent reads filter by child, order newest-first by timestamp with ID only as a deterministic tie-breaker, apply a bound limit, and validate every persisted variant before returning domain events.

`ExpoFeedingIdGenerator` is the native UUID implementation composed at the runtime boundary.

`SqliteBreastfeedingTimerRepository` stores the single app-wide timer session on that same encrypted connection. Timer completion uses `BEGIN IMMEDIATE` on the existing already-keyed SQLCipher connection for feeding insertion and exact-session deletion, so failure leaves the finished session recoverable and success cannot leave it blindly saveable again. It deliberately does not use Expo SQLite's separate-connection exclusive helper, because a second SQLCipher connection has not passed MyBaby's key initialization boundary.

Discard deletes only the matching singleton session ID. Runtime serialization prevents recent reads, discard, ordinary feeding writes, and timer completion from entering each other's database operations.
