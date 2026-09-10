export const bauhausColors = {
  background: '#F0F0F0',
  foreground: '#121212',
  red: '#D02020',
  blue: '#1040C0',
  yellow: '#F0C020',
  muted: '#E0E0E0',
  white: '#FFFFFF',
} as const;

export const bauhausSmallShadow = {
  shadowColor: bauhausColors.foreground,
  shadowOffset: { width: 4, height: 4 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 4,
} as const;

export const bauhausMediumShadow = {
  shadowColor: bauhausColors.foreground,
  shadowOffset: { width: 6, height: 6 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 6,
} as const;
