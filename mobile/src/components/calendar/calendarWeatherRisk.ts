import { Ionicons } from '@expo/vector-icons';

import type { CalendarEvent } from '../../types/calendar';
import { semanticColors } from '../../theme/semanticColors';
import { isDateInEventRange } from './calendarUtils';
import type { CalendarRiskResult } from './calendarRiskEvaluator';
import { weatherIconKind, type WeatherIconKind } from '../shared/WeatherIcon';
import type { WeatherHourlyItem, WeatherMidTermItem } from '../../types/weather';

export type CalendarWeatherRiskIndicator = {
  icon: keyof typeof Ionicons.glyphMap;
  imageKind?: WeatherIconKind;
  key: 'thunder' | 'snowCold' | 'heat' | 'rain' | 'wind' | 'caution';
  label: string;
  priority: number;
  tone: string;
};

function hasThunder(risk?: CalendarRiskResult) {
  const label = risk?.weatherLabel ?? '';
  const lowerLabel = label.toLowerCase();
  return label.includes('\uCC9C\uB465')
    || label.includes('\uBC88\uAC1C')
    || label.includes('\uB099\uB8B0')
    || label.includes('\uB1CC\uC6B0')
    || lowerLabel.includes('thunder')
    || lowerLabel.includes('lightning')
    || lowerLabel.includes('storm');
}

function hasRain(risk?: CalendarRiskResult) {
  const label = risk?.weatherLabel ?? '';
  return !!risk?.rainTimeRange
    || label.includes('\uBE44')
    || (typeof risk?.rainProbability === 'number' && risk.rainProbability >= 60)
    || (typeof risk?.rainMm === 'number' && risk.rainMm > 0);
}

function hasSnowOrCold(risk?: CalendarRiskResult) {
  const label = risk?.weatherLabel ?? '';
  return label.includes('\uB208')
    || label.toLowerCase().includes('snow')
    || (typeof risk?.temperatureMin === 'number' && risk.temperatureMin <= 0)
    || (typeof risk?.temperatureMin !== 'number' && typeof risk?.temperature === 'number' && risk.temperature <= 0);
}

function hasWind(risk?: CalendarRiskResult) {
  return typeof risk?.windSpeed === 'number' && risk.windSpeed >= 8;
}

function hasHeat(risk?: CalendarRiskResult) {
  return (typeof risk?.temperatureMax === 'number' && risk.temperatureMax >= 30)
    || (typeof risk?.temperatureMax !== 'number' && typeof risk?.temperature === 'number' && risk.temperature >= 30);
}

export function weatherRiskIndicators(risk?: CalendarRiskResult): CalendarWeatherRiskIndicator[] {
  const indicators: CalendarWeatherRiskIndicator[] = [];
  if (hasSnowOrCold(risk)) {
    indicators.push({
      icon: 'snow-outline',
      imageKind: 'snow',
      key: 'snowCold',
      label: '\uB208\u00B7\uC800\uC628 \uC8FC\uC758',
      priority: 50,
      tone: semanticColors.weather.danger.tone,
    });
  }
  if (hasThunder(risk)) {
    indicators.push({
      icon: 'thunderstorm-outline',
      imageKind: 'thunder',
      key: 'thunder',
      label: '\uCC9C\uB465\u00B7\uBC88\uAC1C \uC8FC\uC758',
      priority: 40,
      tone: semanticColors.weather.danger.tone,
    });
  }
  if (hasHeat(risk)) {
    const highTemperature = risk?.temperatureMax ?? risk?.temperature;
    indicators.push({
      icon: 'sunny-outline',
      imageKind: 'clear',
      key: 'heat',
      label: typeof highTemperature === 'number' ? `\uACE0\uC628 \uC8FC\uC758 ${Math.round(highTemperature)}\u00B0C` : '\uACE0\uC628 \uC8FC\uC758',
      priority: 35,
      tone: highTemperature && highTemperature >= 33 ? semanticColors.weather.danger.tone : semanticColors.weather.caution.tone,
    });
  }
  if (hasRain(risk)) {
    indicators.push({
      icon: 'rainy-outline',
      imageKind: 'rain',
      key: 'rain',
      label: risk?.rainTimeRange ? `${risk.rainTimeRange} \uBE44 \uC608\uC0C1` : '\uBE44 \uC608\uC0C1',
      priority: 30,
      tone: semanticColors.weather.normal.tone,
    });
  }
  if (hasWind(risk)) {
    indicators.push({
      icon: 'leaf-outline',
      imageKind: 'wind',
      key: 'wind',
      label: risk?.windTimeRange ? `${risk.windTimeRange} \uAC15\uD48D \uC8FC\uC758` : '\uAC15\uD48D \uC8FC\uC758',
      priority: 20,
      tone: semanticColors.weather.caution.tone,
    });
  }
  if (indicators.length === 0 && (risk?.level === 'bad' || risk?.level === 'adjust')) {
    indicators.push({
      icon: 'alert-circle-outline',
      key: 'caution',
      label: risk.badge,
      priority: 10,
      tone: risk.tone,
    });
  }
  return indicators.sort((a, b) => b.priority - a.priority);
}

export function topWeatherRiskForDate(date: string, events: CalendarEvent[], riskByEvent: Record<string, CalendarRiskResult>) {
  return events
    .filter((event) => isDateInEventRange(date, event))
    .flatMap((event) => weatherRiskIndicators(riskByEvent[event.id]))
    .sort((a, b) => b.priority - a.priority)[0];
}

// 일정이 없어도 달력 칸 구석에 보여 줄 그날 날씨(오늘부터 예보가 있는 날까지).
// 비·눈·천둥처럼 한 시간이라도 있으면 그걸, 아니면 가장 많이 나온 하늘 상태를 고른다. 시간별 예보가 없는 날은 중기예보(오전·오후)로 본다.
// 비·눈이 오는 날은 언제 오는지도 함께 준다(예: "14~18시", 중기예보는 "오전"·"오후").
export type CalendarDailyWeather = { kind: WeatherIconKind; time?: string };

const DAILY_WEATHER_ORDER: WeatherIconKind[] = ['thunder', 'snow', 'rain', 'cloudy', 'partlyCloudy', 'clear'];
const PRECIPITATION: WeatherIconKind[] = ['thunder', 'snow', 'rain'];

type DailySlot = { kind: WeatherIconKind; hour?: number; half?: '오전' | '오후' };

function precipitationTime(slots: DailySlot[]) {
  const wet = slots.filter((slot) => PRECIPITATION.includes(slot.kind));
  const hours = wet.map((slot) => slot.hour).filter((hour): hour is number => Number.isFinite(hour));
  if (hours.length > 0) {
    const start = Math.min(...hours);
    const end = Math.max(...hours) + 1;
    return start === 0 && end >= 24 ? '종일' : `${start}~${end}시`;
  }
  const halves = [...new Set(wet.map((slot) => slot.half).filter(Boolean))];
  return halves.length === 1 ? halves[0] : undefined;
}

function dailyWeather(slots: DailySlot[]): CalendarDailyWeather | undefined {
  const kinds = slots.map((slot) => slot.kind);
  const precipitation = PRECIPITATION.find((kind) => kinds.includes(kind));
  if (precipitation) return { kind: precipitation, time: precipitationTime(slots) };
  if (kinds.length === 0) return undefined;
  const count = (kind: WeatherIconKind) => kinds.filter((item) => item === kind).length;
  // 같은 횟수면 흐린 쪽(cloudy > partlyCloudy > clear)을 고른다.
  return { kind: DAILY_WEATHER_ORDER.slice(3).reduce((best, kind) => (count(kind) > count(best) ? kind : best)) };
}

export function dailyWeatherByDate({ todayDateLabel, weatherHourlyItems = [], weatherMidTermItems = [] }: {
  todayDateLabel: string;
  weatherHourlyItems?: WeatherHourlyItem[];
  weatherMidTermItems?: WeatherMidTermItem[];
}) {
  const slotsByDate: Record<string, DailySlot[]> = {};
  const add = (date: string, label: string | undefined, slot: Omit<DailySlot, 'kind'>) => {
    const kind = weatherIconKind(label);
    if (DAILY_WEATHER_ORDER.includes(kind)) (slotsByDate[date] ??= []).push({ kind, ...slot });
  };
  weatherHourlyItems.forEach((item) => {
    if (item.date && item.date >= todayDateLabel) add(item.date, item.label, { hour: Number.parseInt(item.hour ?? '', 10) });
  });
  weatherMidTermItems.forEach((item) => {
    if (!item.date || item.date < todayDateLabel || slotsByDate[item.date]) return;
    add(item.date, item.weatherAm, { half: '오전' });
    add(item.date, item.weatherPm, { half: '오후' });
  });
  const result: Record<string, CalendarDailyWeather> = {};
  Object.entries(slotsByDate).forEach(([date, slots]) => {
    const weather = dailyWeather(slots);
    if (weather) result[date] = weather;
  });
  return result;
}

// 날짜를 눌렀을 때 아래 시트에 보여 줄 그날 비·눈 시간대 배지(일정이 없어도). 같은 종류의 일정 배지가 있으면 그쪽을 쓴다.
export function dailyPrecipitationIndicator(weather?: CalendarDailyWeather): CalendarWeatherRiskIndicator | undefined {
  if (!weather || !PRECIPITATION.includes(weather.kind)) return undefined;
  const when = weather.time ? `${weather.time} ` : '';
  if (weather.kind === 'thunder') {
    return { icon: 'thunderstorm-outline', imageKind: 'thunder', key: 'thunder', label: `${when}천둥·번개 예상`, priority: 40, tone: semanticColors.weather.danger.tone };
  }
  if (weather.kind === 'snow') {
    return { icon: 'snow-outline', imageKind: 'snow', key: 'snowCold', label: `${when}눈 예상`, priority: 50, tone: semanticColors.weather.danger.tone };
  }
  return { icon: 'rainy-outline', imageKind: 'rain', key: 'rain', label: `${when}비 예상`, priority: 30, tone: semanticColors.weather.normal.tone };
}
