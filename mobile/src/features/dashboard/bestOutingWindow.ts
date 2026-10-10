import type { HourlyDustItem, WeatherHourlyItem } from '../../types/dust';
import { toNumber } from '../../utils/dust';
import { calculateOutingIndex, isRainyWeather, isThunderWeather } from '../outing/outingIndex';

export type BestOutingWindow = {
  startHour: number;
  endHour: number;
  weatherLabel?: string;
  temperature?: number;
  pm10?: number;
};

type HourScore = BestOutingWindow & { score: number };

const FIRST_HOUR = 6;
const LAST_START_HOUR = 21; // 21~22시가 마지막 창
const GOOD_SCORE = 62;

function hourOf(item: { hour?: string; measuredAt?: string }) {
  const text = item.hour?.slice(0, 2) || item.measuredAt?.slice(11, 13);
  const hour = Number(text);
  return text && Number.isFinite(hour) ? hour : undefined;
}

function dateOf(item: { date?: string; measuredAt?: string }) {
  return item.date || item.measuredAt?.slice(0, 10) || '';
}

// 오늘 남은 시간 중 외출 지수가 가장 좋은 연속 2시간(없으면 1시간)을 고릅니다.
// 민감군이면 미세먼지 '보통'(30 초과)인 시간도 좋은 시간에서 뺍니다.
export function findBestOutingWindow({ dustItems, fallbackPm10, nowHour, sensitive = false, todayDateLabel, weatherItems }: {
  dustItems: HourlyDustItem[];
  fallbackPm10?: number;
  nowHour: number;
  sensitive?: boolean;
  todayDateLabel: string;
  weatherItems: WeatherHourlyItem[];
}): BestOutingWindow | null {
  const dustLimit = sensitive ? 30 : 80;
  const dustByHour = new Map<number, number>();
  dustItems.forEach((item) => {
    const hour = hourOf(item);
    const pm10 = toNumber(item.pm10Value);
    if (dateOf(item) === todayDateLabel && hour !== undefined && pm10 !== undefined) dustByHour.set(hour, pm10);
  });

  const good = new Map<number, HourScore>();
  weatherItems.forEach((item) => {
    const hour = hourOf(item);
    if (dateOf(item) !== todayDateLabel || hour === undefined || hour < Math.max(nowHour, FIRST_HOUR) || hour > LAST_START_HOUR) return;
    const pm10 = dustByHour.get(hour) ?? fallbackPm10;
    const rainMm = toNumber(item.rain_mm);
    const rainProbability = toNumber(item.rain_probability);
    // 외출 지수는 비에 16점만 깎아 '좋음'에 남을 수 있어, 비·천둥 시간은 따로 뺍니다.
    if (isRainyWeather(item.label) || isThunderWeather(item.label) || (rainMm ?? 0) > 0 || (rainProbability ?? 0) >= 60) return;
    const temperature = toNumber(item.temperature);
    const score = calculateOutingIndex({
      pm10,
      rainMm,
      rainProbability,
      temperature,
      weatherLabel: item.label,
      windSpeed: toNumber(item.wind_speed),
    });
    if (score === undefined || score < GOOD_SCORE || (pm10 !== undefined && pm10 > dustLimit)) return;
    good.set(hour, { endHour: hour + 1, pm10, score, startHour: hour, temperature, weatherLabel: item.label });
  });

  let best: HourScore | null = null;
  let bestLength = 0;
  [...good.values()].sort((a, b) => a.startHour - b.startHour).forEach((first) => {
    const second = good.get(first.startHour + 1);
    const length = second ? 2 : 1;
    const score = second ? Math.min(first.score, second.score) : first.score;
    if (length > bestLength || (length === bestLength && best && score > best.score)) {
      bestLength = length;
      best = { ...first, endHour: first.startHour + length, score };
    }
  });
  if (!best) return null;
  const { score: _score, ...window } = best as HourScore;
  return window;
}

export function dustGradeLabel(pm10?: number) {
  if (pm10 === undefined) return undefined;
  if (pm10 <= 30) return '좋음';
  if (pm10 <= 80) return '보통';
  if (pm10 <= 150) return '나쁨';
  return '매우나쁨';
}

export function bestOutingWindowText(window: BestOutingWindow) {
  const details = [
    window.weatherLabel,
    window.pm10 === undefined ? undefined : `미세먼지 ${dustGradeLabel(window.pm10)}`,
    window.temperature === undefined ? undefined : `${Math.round(window.temperature)}°`,
  ].filter(Boolean).join(' · ');
  return { details, time: `${window.startHour}~${window.endHour}시` };
}
