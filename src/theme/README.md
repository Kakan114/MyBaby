# Design system

MyBaby's visual direction is **Soft Sage**: warm, calm, safe, natural, modern, and familiar, while remaining clean and information-focused.

The first design-system foundation lives in `tokens.ts`:

- `primitiveColors` contains raw palette values and should mainly be used to build themes.
- `lightColors` contains meaning-based colors for UI, such as `background`, `surface`, `textPrimary`, and `actionPrimary`.
- `spacing`, `radii`, `typography`, and `shadows` provide the shared layout and visual scales. Typography intentionally uses React Native's system font; no external font is configured.

UI should import tokens directly from `@/theme/tokens`. Prefer semantic color tokens and the shared scales over direct hex colors or magic spacing values. Use a raw primitive only when no semantic meaning applies.

`primitiveColors.sage` is the Soft Sage brand and accent color. Text-bearing primary actions use the darker semantic `actionPrimary` and `actionPrimaryPressed` colors to maintain robust contrast with `actionPrimaryText`.

`lightColors` is the current theme. A future dark theme should implement the same `SemanticColorTokens` keys so consumers can switch themes without changing their styles. Dark mode is not implemented yet.

The existing Expo starter UI and `src/constants/theme.ts` remain unchanged until the design system is adopted by screens and components in a later step.
