# Today data foundation

Today owns a read-only application snapshot, not feature writes or cached totals.
The snapshot resolves the authoritative active child once and derives all feature
reads from that ID. Existing conditional stale-selection cleanup is preserved;
no new product mutation is introduced.

AppRuntime initializes and tracks the accepted operation before acquiring the
shared database queue exactly once. Child resolution, captured epoch time, local
day context and all feature reads occur while the queue is held. The Today
runtime never calls public feature runtime operations, preventing nested queue
acquisition. Sequential reads ensure no pending database reads escape after a
failure releases the queue. Consistency assumes product writes use this shared
runtime/connection; another connection or external writer would require an
explicit database snapshot strategy.

Feeding and diaper counts use [local day start, next local day start). Latest
timestamps cover all canonical history, including records ahead of a rolled-back
device clock. Unsaved breastfeeding timer sessions are not completed feedings.

Completed sleep is the UNION of all overlapping intervals clipped to the local
day; duplicated, nested, adjacent and cross-midnight intervals cannot inflate the
total. Original events are unchanged. Active sleep is separate, with elapsed
time and a backward-clock flag from the existing Sleep domain function.

The injected local-day adapter receives a captured epoch instant, uses the
device timezone, and produces CalendarDate plus half-open epoch bounds. Calendar
advancement accommodates 23/25-hour DST days. No alternative clock is read inside
domain/application code. Future birth/reference-date failures remain sanitized.

Schema v6 remains unchanged. Diaper range counts can use its existing child/time
index; Feeding and Sleep may scan histories because their corresponding indexes
do not exist. Reads transfer aggregate counts and overlapping sleep only, never
LIMIT-20 histories. Union computation costs O(k log k) for k overlapping events.
Benchmark native large histories before adding any optional index migration.

The result distinguishes ready from missing-active-child; errors are sanitized
at the runtime boundary. Missing does not imply onboarding. Today UI, focus/resume
refresh, polling and Swedish dashboard wording are deliberately deferred to 20.17B.

## Step 20.17A file inventory

Created:
- src/data/local/event-statistics.ts
- src/data/local/event-statistics.test.ts
- src/utils/epoch-range.ts
- src/features/feeding/application/feeding-summary-reader.ts
- src/features/diapers/application/diaper-summary-reader.ts
- src/features/sleep/application/sleep-day-reader.ts
- src/features/sleep/application/get-sleep-day-summary.ts
- src/features/sleep/domain/sleep-day-union.test.ts
- src/features/today/README.md
- src/features/today/application/today-summary.ts
- src/features/today/application/get-today-summary.ts
- src/features/today/application/get-today-summary.test.ts
- src/features/today/data/local-day-context.ts
- src/features/today/data/local-day-context.test.ts
- src/features/today/data/today-sqlite.integration.test.ts
- src/features/today/runtime/create-today-runtime.ts
- src/features/today/runtime/create-today-runtime.test.ts

Modified:
- src/features/feeding/data/sqlite-feeding-repository.ts
- src/features/diapers/data/sqlite-diaper-repository.ts
- src/features/sleep/data/sqlite-sleep-repository.ts
- src/features/sleep/domain/sleep.ts
- src/runtime/app-runtime.ts
- src/runtime/app-runtime.test.ts
- src/runtime/create-production-app-runtime.ts
- src/runtime/app-runtime-provider.tsx

The pre-existing src/components/ui/button.tsx modification is untouched.

## Step 20.17B presentation

Today uses only the canonical TodayRuntime snapshot. The route composes the
feature screen; Swedish formatting, snapshot lifecycle and dashboard rendering
are separate. The existing ChildAge formatter and activeSleepElapsedMs domain
helper are reused. No education/medical content is fabricated.

Ready content is retained during focus/resume/calendar refresh. Missing and
failed results remove it; missing invokes bootstrap recovery. Selection-change
notifications clear old child data before initialization/queue work and reject
previous pending snapshots. Notifications remain subscribed while the tab is
blurred; no data read runs while blurred or backgrounded.

A focused local sleep display clock ticks once a second without database reads.
A timeout targets next civil midnight (including 23/25-hour days); a local
30-second check detects timezone/date/offset changes and reschedules the timeout.
Timezone changes while focused therefore have up to 30 seconds detection delay.
Focus/resume reads immediately. No periodic database polling is added.

Created (all under src/features/today/presentation):
- today-screen.tsx
- today-dashboard.tsx
- today-controller.ts
- use-today-summary.ts
- today-format.ts
- today-test-fixture.ts
- today-screen.test.tsx
- today-controller.test.ts
- use-today-summary.test.ts
- today-format.test.ts

Modified for 20.17B:
- src/app/(tabs)/index.tsx
- src/i18n/locales/sv.ts
- src/runtime/app-runtime.ts
- src/runtime/app-runtime.test.ts
- src/features/today/runtime/create-today-runtime.ts
- src/features/today/data/today-sqlite.integration.test.ts
- src/features/today/README.md

Native iOS/Android verification remains necessary for font scaling, VoiceOver/
TalkBack, scrolling, quick-route navigation, sleep timing, resume, midnight and
timezone changes. Button is byte-for-byte unchanged; its existing iOS
verification remains pending. Native large-history performance retains the
20.17A indexing limitation.
