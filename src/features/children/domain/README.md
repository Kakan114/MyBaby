# Children domain

This framework-independent domain currently owns the minimal `Child` entity, calendar-date validation, and deterministic age calculations. It must not import React, React Native, Expo, Supabase, or SQLite.

`dateOfBirth` uses a validated branded `CalendarDate` string in canonical `YYYY-MM-DD` form. It represents a calendar date, not an instant or timezone. UTC is used only internally to count whole date boundaries, so device timezone changes cannot shift the stored birth date.

Age functions require an explicit `asOf` `CalendarDate`, return structured numeric data, and throw `RangeError` when the reference date is before birth. Month/year anniversaries that do not exist, such as 29 February in a non-leap year, clamp to that month's final day.

Ownership and access are deliberately absent from `Child`; they belong to the future `child_members` model and its authorization layer.

Use-case orchestration and infrastructure ports belong in the adjacent `application/` layer. This domain does not depend on them.
