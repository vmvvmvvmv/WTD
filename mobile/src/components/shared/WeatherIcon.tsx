import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

export type WeatherIconKind = 'clear' | 'partlyCloudy' | 'cloudy' | 'rain' | 'snow' | 'wind' | 'thunder' | 'unknown';

const WEATHER_ICON_SOURCES = {
  clear: require('../../../assets/icons/weather-clear.png'),
  partlyCloudy: require('../../../assets/icons/weather-partly-cloudy.png'),
  cloudy: require('../../../assets/icons/weather-cloudy.png'),
  rain: require('../../../assets/icons/weather-rain.png'),
  snow: require('../../../assets/icons/weather-snow.png'),
  wind: require('../../../assets/icons/weather-wind.png'),
  thunder: require('../../../assets/icons/weather-thunder.png'),
} as const;

// Visible artwork bounds in each 256px PNG canvas (alpha > 32).
const WEATHER_ICON_BOUNDS = {
  clear: [61, 61, 196, 196],
  partlyCloudy: [41, 41, 229, 196],
  cloudy: [46, 77, 221, 174],
  rain: [46, 77, 221, 228],
  snow: [46, 77, 221, 237],
  wind: [30, 77, 221, 235],
  thunder: [46, 77, 221, 244],
} as const satisfies Record<keyof typeof WEATHER_ICON_SOURCES, readonly [number, number, number, number]>;

const WEATHER_ICON_LABELS: Record<WeatherIconKind, string> = {
  clear: '맑음',
  partlyCloudy: '구름 조금',
  cloudy: '흐림',
  rain: '비',
  snow: '눈',
  wind: '강풍',
  thunder: '뇌우',
  unknown: '날씨 확인 중',
};

export function weatherIconKind(label?: string | null, windSpeed?: number | null): WeatherIconKind {
  const value = label ?? '';
  if (/천둥|번개|낙뢰|뇌우|thunder|lightning|storm/i.test(value)) return 'thunder';
  if (/눈|snow/.test(value)) return 'snow';
  if (/비|소나기|강수|rain|shower/i.test(value)) return 'rain';
  if (/강풍|강한 바람|wind/i.test(value) || (windSpeed != null && windSpeed >= 8)) return 'wind';
  if (/구름\s*(?:조금|많)|partly/i.test(value)) return 'partlyCloudy';
  if (/흐림|구름|안개|cloud|fog/i.test(value)) return 'cloudy';
  if (/맑음|clear|sun/i.test(value)) return 'clear';
  return value ? 'clear' : 'unknown';
}

export function WeatherIcon({
  accessibilityLabel,
  kind,
  size = 24,
  style,
}: {
  accessibilityLabel?: string;
  kind: WeatherIconKind;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  if (kind === 'unknown') {
    return <Ionicons color="#B7C0CC" name="time-outline" size={size} />;
  }

  const [left, top, right, bottom] = WEATHER_ICON_BOUNDS[kind];
  const scale = (256 * 0.94) / Math.max(right - left, bottom - top);
  const translateX = ((128 - (left + right) / 2) / 256) * size * scale;
  const translateY = ((128 - (top + bottom) / 2) / 256) * size * scale;

  return (
    <Image
      accessibilityLabel={accessibilityLabel ?? WEATHER_ICON_LABELS[kind]}
      accessible={!!accessibilityLabel}
      fadeDuration={0}
      resizeMode="contain"
      source={WEATHER_ICON_SOURCES[kind]}
      style={[{ flexShrink: 0, width: size, height: size, transform: [{ translateX }, { translateY }, { scale }] }, style]}
    />
  );
}
