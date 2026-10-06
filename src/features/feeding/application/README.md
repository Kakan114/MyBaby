# Feeding application

The application layer owns `FeedingRepository`, `BreastfeedingTimerRepository`, `FeedingIdGenerator`, and `EpochClock`. Timer use cases persist explicit transitions and preserve the child that started the session. Completion converts frozen milliseconds to whole seconds and asks the timer repository to insert the completed event and clear the finished session atomically. Explicit discard targets the exact owned session and never creates a feeding event.
