import { bauhausColors } from './bauhaus';

export type AppColors = {
  background: string;
  card: string;
  cardMuted: string;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  primaryBorder: string;
  border: string;
  text: string;
  textMuted: string;
  warning: string;
  danger: string;
};

export const lightColors: AppColors = {
  background: bauhausColors.background,
  card: bauhausColors.white,
  cardMuted: bauhausColors.muted,
  primary: bauhausColors.blue,
  primaryStrong: bauhausColors.blue,
  primarySoft: bauhausColors.muted,
  primaryBorder: bauhausColors.foreground,
  border: bauhausColors.foreground,
  text: bauhausColors.foreground,
  textMuted: '#4a4a4a',
  warning: '#c77b24',
  danger: '#c84a4a',
} as const;

export const darkColors: AppColors = {
  background: '#242424',
  card: '#FFFFFF',
  cardMuted: '#E0E0E0',
  primary: '#1040C0',
  primaryStrong: '#1040C0',
  primarySoft: '#E0E0E0',
  primaryBorder: '#121212',
  border: '#121212',
  text: '#121212',
  textMuted: '#4a4a4a',
  warning: '#e4a34a',
  danger: '#f07171',
} as const;
