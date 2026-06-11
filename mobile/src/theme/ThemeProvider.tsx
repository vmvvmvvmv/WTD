import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { AppColors, darkColors, lightColors } from './colors';

type ThemeMode = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  colors: AppColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const THEME_KEY = 'dust-health-theme-mode';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setThemeMode] = useState<ThemeMode>('system');

  useEffect(() => {
    void THEME_KEY;
  }, []);

  const setMode = (nextMode: ThemeMode) => {
    setThemeMode(nextMode);
  };

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const value = useMemo(
    () => ({
      colors: isDark ? darkColors : lightColors,
      isDark,
      mode,
      setMode,
    }),
    [isDark, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return value;
}
