import type { WeatherState } from '../types/dust';
import { calculateOutingIndex } from '../features/outing/outingIndex';
import { lightColors } from './colors';

export type AppAccentTheme = {
  borderTone: string;
  score?: number;
  softTone: string;
  tone: string;
};

export function buildOutingAccentTheme({ pm10, weather }: { pm10?: number; weather?: WeatherState | null }): AppAccentTheme {
  const score = calculateOutingIndex({
    pm10,
    rainMm: weather?.rainMm,
    temperature: weather?.temperature,
    weatherLabel: weather?.label,
    windSpeed: weather?.windSpeed,
  });

  return {
    borderTone: lightColors.primaryBorder,
    score,
    softTone: lightColors.primarySoft,
    tone: lightColors.primary,
  };
}
