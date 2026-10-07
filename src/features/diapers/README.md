# Diaper feature

`diapers` follows `presentation -> application -> domain`, with `data` implementing application-owned ports. Completed events belong to the runtime-resolved active child and are stored in the shared encrypted database. Presentation never supplies a child ID or accesses SQLite.

Step 20.16 supports immediate and explicit historical wet, dirty, or mixed logging plus the 20 most recent events. A newly logged event can be undone briefly, and history entries can be edited or deleted through exact, child-owned snapshot checks. Runtime operations share the application database queue with Feeding and Sleep. Totals, medical interpretation, reminders, cloud sync, and Today integration remain outside this feature.
