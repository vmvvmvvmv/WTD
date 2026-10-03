export const bauhausColors = {
  // One UI-inspired weather palette. Keep the legacy export name to avoid
  // touching every feature component that already imports these shared tokens.
  background: '#F4F8FC',
  foreground: '#17202A',
  red: '#E85C6B',
  redSoft: '#FFF0EE',
  blue: '#3D7FEA',
  blueSoft: '#E8F1FE',
  yellow: '#FFB95C',
  muted: '#E7EFF7',
  border: '#D7E4F2',
  surface: '#F8FAFD',
  white: '#FFFFFF',
} as const;

export const bauhausSmallShadow = {
  shadowColor: bauhausColors.foreground,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
} as const;

export const bauhausMediumShadow = {
  shadowColor: bauhausColors.foreground,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 12,
  elevation: 4,
} as const;

export const handDrawnCardShape = {
  borderRadius: 24,
} as const;

export const handDrawnControlShape = {
  borderRadius: 14,
} as const;
