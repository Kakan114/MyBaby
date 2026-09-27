# Shared components

`components/` contains generic UI that can be reused across features. Feature-specific UI stays in that feature's `presentation/` layer.

The primitives in `ui/` provide the current Soft Sage foundation:

- `AppText` applies the shared typography variants and default text color.
- `Button` provides primary and secondary actions, including pressed and disabled states.
- `Card` provides a standard surface container.
- `Screen` provides a safe-area-aware, non-scrollable screen container.

These primitives intentionally do not provide feature logic, data access, navigation, loading states, icons, animation, or automatic scrolling. Compose those concerns at the appropriate route or feature boundary when they are actually needed.
