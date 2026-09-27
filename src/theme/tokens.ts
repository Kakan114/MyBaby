import type { TextStyle, ViewStyle } from 'react-native';

export const primitiveColors = {
  sage: '#738F7B',
  sageDark: '#52695A',
  sageDeep: '#3F5246',
  sageLight: '#DDE8DF',
  offWhite: '#F7F6F1',
  white: '#FFFFFF',
  charcoal: '#26302A',
  mutedText: '#66736B',
  softBlue: '#DCEAF2',
  blue: '#527A91',
  peach: '#F4D5C5',
  sand: '#EDE4D3',
  amber: '#A66B24',
  red: '#B85C5C',
} as const;

export const lightColors = {
  background: primitiveColors.offWhite,
  surface: primitiveColors.white,
  surfaceMuted: primitiveColors.sageLight,
  textPrimary: primitiveColors.charcoal,
  textSecondary: primitiveColors.mutedText,
  textInverse: primitiveColors.white,
  actionPrimary: primitiveColors.sageDark,
  actionPrimaryPressed: primitiveColors.sageDeep,
  actionPrimaryText: primitiveColors.white,
  borderSubtle: primitiveColors.sand,
  borderStrong: primitiveColors.sage,
  accentSage: primitiveColors.sageLight,
  accentBlue: primitiveColors.softBlue,
  accentPeach: primitiveColors.peach,
  accentSand: primitiveColors.sand,
  success: primitiveColors.sageDark,
  warning: primitiveColors.amber,
  error: primitiveColors.red,
  information: primitiveColors.blue,
} as const;

export type SemanticColorTokens = {
  [Token in keyof typeof lightColors]: string;
};

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
} as const;

export const radii = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const typography = {
  display: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.8,
  },
  headingLarge: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.4,
  },
  headingMedium: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: fontWeights.semibold,
    letterSpacing: -0.2,
  },
  headingSmall: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: fontWeights.semibold,
    letterSpacing: 0,
  },
  bodyLarge: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: fontWeights.regular,
    letterSpacing: 0,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: fontWeights.regular,
    letterSpacing: 0,
  },
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: fontWeights.regular,
    letterSpacing: 0,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: fontWeights.semibold,
    letterSpacing: 0.2,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeights.medium,
    letterSpacing: 0.2,
  },
} as const satisfies Record<string, TextStyle>;

export const shadows = {
  subtle: {
    shadowColor: primitiveColors.charcoal,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  raised: {
    shadowColor: primitiveColors.charcoal,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
} as const satisfies Record<string, ViewStyle>;
