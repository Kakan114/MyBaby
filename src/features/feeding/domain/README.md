# Feeding domain

`FeedingEvent` is a discriminated breast/bottle union. Common fields are an opaque ID, child ownership, and an integer epoch-millisecond occurrence instant. Breast durations use whole seconds. Bottle amounts allow one decimal place and are persisted as integer tenths of a millilitre; `mixed` means the same bottle contains both expressed breast milk and formula.

The layer is framework- and infrastructure-independent. It contains no React, Expo, SQLite, or clock access.

`BreastfeedingTimerSession` is an explicit running/paused/finished state machine. It stores accumulated milliseconds and, only while running, a wall-clock segment anchor. Elapsed time is derived from the injected epoch clock rather than tick counters. A backward clock pauses without inventing time. Arbitrary forward wall-clock changes cannot be distinguished from genuine elapsed/background time without a future native monotonic-clock design.
