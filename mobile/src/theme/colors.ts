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
  background: '#f7fbf9',
  card: '#ffffff',
  cardMuted: '#f9faf9',
  primary: '#2fbf71',
  primaryStrong: '#279b64',
  primarySoft: '#e7f6ed',
  primaryBorder: '#d9eee2',
  border: '#cfe9da',
  text: '#141821',
  textMuted: '#687180',
  warning: '#c77b24',
  danger: '#c84a4a',
} as const;

export const darkColors: AppColors = {
  background: '#0f1318',
  card: '#171c22',
  cardMuted: '#20262e',
  primary: '#54d98c',
  primaryStrong: '#8de8b2',
  primarySoft: '#1f3b2b',
  primaryBorder: '#2d563d',
  border: '#27303a',
  text: '#f4f7f5',
  textMuted: '#c2cad4',
  warning: '#e4a34a',
  danger: '#f07171',
} as const;
