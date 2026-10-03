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
  primarySoft: bauhausColors.blueSoft,
  primaryBorder: bauhausColors.border,
  border: bauhausColors.border,
  text: bauhausColors.foreground,
  textMuted: '#718096',
  warning: '#D89232',
  danger: bauhausColors.red,
} as const;

export const darkColors: AppColors = {
  background: '#F4F8FC',
  card: '#FFFFFF',
  cardMuted: '#E7EFF7',
  primary: '#3D7FEA',
  primaryStrong: '#2F6FD7',
  primarySoft: bauhausColors.blueSoft,
  primaryBorder: bauhausColors.border,
  border: bauhausColors.border,
  text: '#17202A',
  textMuted: '#718096',
  warning: '#D89232',
  danger: '#E85C6B',
} as const;
