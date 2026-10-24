export type WeatherVisualKind = 'clear' | 'cloudy' | 'rain' | 'snow';

export function getWeatherVisualKind(label?: string): WeatherVisualKind {
  if (label?.includes('눈')) return 'snow';
  if (label && /비|소나기|뇌우|강수|천둥|번개|낙뢰/.test(label)) return 'rain';
  if (label && /흐림|구름|안개/.test(label)) return 'cloudy';
  return 'clear';
}
