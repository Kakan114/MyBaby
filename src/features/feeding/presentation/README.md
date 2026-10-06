# Feeding presentation

The completed-feeding screen accepts Swedish minute and millilitre input, then submits feeding-specific details through `FeedingRuntime`. The runtime supplies the active child, ID, and current instant. An uncertain write stays locked to avoid blindly creating a duplicate event.
