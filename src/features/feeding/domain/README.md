# Feeding domain

`FeedingEvent` is a discriminated breast/bottle union. Common fields are an opaque ID, child ownership, and an integer epoch-millisecond occurrence instant. Breast durations use whole seconds. Bottle amounts allow one decimal place and are persisted as integer tenths of a millilitre; `mixed` means the same bottle contains both expressed breast milk and formula.

The layer is framework- and infrastructure-independent. It contains no React, Expo, SQLite, or clock access.
