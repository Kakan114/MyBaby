# Feeding application

The application layer owns `FeedingRepository`, `FeedingIdGenerator`, and the `recordFeeding` use case. It constructs a validated domain event and persists it, while runtime composition supplies active-child ownership and the current instant.
