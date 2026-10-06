# Feeding data

`SqliteFeedingRepository` implements the application-owned port on the shared encrypted database connection. It binds every value and maps the union to mutually exclusive nullable columns. Recording inserts a new event; an ID collision fails instead of replacing or mutating an existing event.

`ExpoFeedingIdGenerator` is the native UUID implementation composed at the runtime boundary.
