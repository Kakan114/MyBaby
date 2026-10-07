# Sleep feature

Sleep follows the project feature layers: presentation calls application-facing runtime operations, application owns the repository port and rules, domain validates canonical sleep values, and data implements encrypted SQLite persistence.

An active session stores only its ID, child ID, and start epoch. A completed event adds its end epoch; duration is always derived. Active sessions are owned per child and survive navigation, suspension, and process restart in the encrypted `mybaby.db`. Completion atomically inserts the completed event and deletes the exact session. UI ticks never become persisted state.

Step 20.14 accepts forward wall-clock changes, which can overcount elapsed sleep. Backward movement never produces negative time and blocks completion until the clock is valid. Manual/backdated entry and correction are deferred.
