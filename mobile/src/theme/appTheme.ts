import type { WeatherState } from '../types/dust';
import { calculateOutingIndex, getOutingBorderTone, getOutingSoftTone, getOutingTone } from '../components/calendar/outingIndex';

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
    borderTone: getOutingBorderTone(score),
    score,
    softTone: getOutingSoftTone(score),
    tone: getOutingTone(score),
  };
}
