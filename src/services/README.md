# Application services

Cross-cutting integrations live here. Areas include authentication, notifications, and AI access. Services expose app-owned interfaces so features do not depend directly on vendor APIs. Feature-specific business logic does not belong here.

Reminder notifications are a fallible operating-system projection of canonical encrypted SQLite reminders. Reconciliation snapshots all children's upcoming reminders under the shared database queue, releases that queue before native notification calls, and uses stable app-owned identifiers. Notification content is generic and contains no child name, reminder title, note, or sensitive payload. Permission prompts are allowed only after an explicit user action.

AI remains an online-only service. Core tracking and previously downloaded content are designed to remain available offline.
