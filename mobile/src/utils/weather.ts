import type { WeatherState } from '../types/dust';

export function getWeatherIcon(label?: string) {
  if (label === '비') return 'rainy-outline';
  if (label === '눈') return 'snow-outline';
  if (label === '흐림' || label === '안개') return 'cloudy-outline';
  return 'sunny-outline';
}

export function normalizeWeatherState(data: unknown): WeatherState | null {
  const item = data as {
    humidity?: unknown;
    label?: unknown;
    measured_at?: unknown;
    rain_mm?: unknown;
    temperature?: unknown;
    wind_direction?: unknown;
    wind_speed?: unknown;
  } | null;
  if (!item) return null;

  const temperature = Number(item.temperature);
  const humidity = Number(item.humidity);
  const windSpeed = Number(item.wind_speed);
  const windDirection = Number(item.wind_direction);
  const rainMm = Number(item.rain_mm);
  return {
    label: typeof item.label === 'string' ? item.label : '흐림',
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    humidity: Number.isFinite(humidity) ? humidity : undefined,
    windSpeed: Number.isFinite(windSpeed) ? windSpeed : undefined,
    windDirection: Number.isFinite(windDirection) ? windDirection : undefined,
    rainMm: Number.isFinite(rainMm) ? rainMm : undefined,
    measured_at: typeof item.measured_at === 'string' ? item.measured_at : undefined,
  };
}
