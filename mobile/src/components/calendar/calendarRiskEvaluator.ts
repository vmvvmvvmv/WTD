import type { CalendarEvent } from '../../types/calendar';
import type { HourlyDustItem, PredictionResponse } from '../../types/dust';
import type { WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/weather';
import { toNumber } from '../../utils/format';
import { isRainyWeather, isThunderWeather } from '../../features/outing/outingIndex';
import { semanticColors } from '../../theme/semanticColors';
import { addMinutesToDateTime } from './calendarUtils';

export type CalendarRiskLevel = 'good' | 'watch' | 'adjust' | 'bad' | 'unknown';

export type CalendarRiskResult = {
  badge: string;
  basis: string;
  desc: string;
  icon: 'home-outline' | 'bus-outline' | 'walk-outline' | 'alert-circle-outline';
  level: CalendarRiskLevel;
  pm10?: number;
  // 일정을 1~3시간 옮기면 비를 피할 수 있을 때의 제안
  rainFreeSuggestion?: RainFreeSuggestion;
  rainMm?: number;
  rainProbability?: number;
  rainTimeRange?: string;
  temperature?: number;
  temperatureMax?: number;
  temperatureMin?: number;
  tone: string;
  weatherLabel?: string;
  windSpeed?: number;
  windTimeRange?: string;
};

export type RainFreeSuggestion = {
  endTime?: string;
  offsetHours: number;
  time: string;
};

type DustPoint = {
  date: string;
  label: string;
  pm10: number;
};

type WeatherPoint = {
  date: string;
  label: string;
  rainMm: number | undefined;
  rainProbability: number | undefined;
  temperature: number | undefined;
  weatherLabel: string | undefined;
  windSpeed: number | undefined;
};

type MidTermPoint = {
  rainProbability?: number;
  temperature?: number;
  weatherLabel?: string;
};

type RiskContext = {
  currentPm10?: number;
  // 테스트에서 현재 시각을 고정할 때만 넘긴다.
  now?: Date;
  dustItems?: HourlyDustItem[];
  locationBasis?: string;
  prediction?: PredictionResponse | null;
  todayDateLabel: string;
  weather?: WeatherState | null;
  weatherItems?: WeatherHourlyItem[];
  weatherMidTermItems?: WeatherMidTermItem[];
};

const EVENT_WEATHER_BUFFER_MS = 60 * 60 * 1000;

const TEXT = {
  adjust: '주의',
  bad: '경고',
  currentBasis: '현재 기준',
  forecastNeeded: '예보 확인 필요',
  good: '좋음',
  midTermBasis: '중기예보 기준',
  unknown: '확인 중',
  watch: '확인',
  past: '지난 일정',
};

function dateMs(value?: string) {
  const time = new Date(`${value ?? ''}T00:00:00`).getTime();
  return Number.isNaN(time) ? undefined : time;
}

function dateTimeMs(date?: string, time?: string) {
  const normalizedTime = time && /^\d{1,2}:\d{2}$/.test(time) ? time : '00:00';
  const value = new Date(`${date ?? ''}T${normalizedTime}:00`).getTime();
  return Number.isNaN(value) ? undefined : value;
}

function pointDate(item: { date?: string; measuredAt?: string }) {
  return item.date ?? (item.measuredAt ? item.measuredAt.slice(0, 10) : '');
}

function pointHour(item: { hour?: string; measuredAt?: string }) {
  return item.hour ?? (item.measuredAt ? item.measuredAt.slice(11, 16) : '');
}

function normalizeDustPoints(items?: HourlyDustItem[]) {
  // Risk evaluation always works with normalized date/hour points, regardless of API response shape.
  return (items ?? [])
    .map((item) => ({
      date: pointDate(item),
      label: pointHour(item),
      pm10: toNumber(item.pm10Value),
    }))
    .filter((item): item is DustPoint => !!item.date && !!item.label && typeof item.pm10 === 'number');
}

function dailyPredictionForEvent(event: CalendarEvent, prediction?: PredictionResponse | null) {
  const dates = prediction?.future_dates ?? [];
  const values = prediction?.predictions ?? [];
  const index = dates.findIndex((date) => date === event.date);
  if (index < 0) return undefined;
  return toNumber(values[index]);
}

function normalizeWeatherPoints(items?: WeatherHourlyItem[]) {
  return (items ?? [])
    .map((item) => ({
      date: pointDate(item),
      label: pointHour(item),
      rainMm: toNumber(item.rain_mm),
      rainProbability: toNumber(item.rain_probability),
      temperature: toNumber(item.temperature),
      weatherLabel: item.label,
      windSpeed: toNumber(item.wind_speed),
    }))
    .filter((item): item is WeatherPoint => !!item.date && !!item.label);
}

function eventRange(event: CalendarEvent) {
  const start = dateTimeMs(event.date, event.time);
  let end = dateTimeMs(event.endDate ?? event.date, event.endTime ?? event.time);
  if (typeof start === 'number' && typeof end === 'number' && end < start) {
    end = start + 60 * 60 * 1000;
  }
  return { end, start };
}


function isPastEvent(event: CalendarEvent, todayDateLabel: string, now = new Date()) {
  const end = dateMs(event.endDate ?? event.date);
  const today = dateMs(todayDateLabel);
  if (typeof end !== 'number' || typeof today !== 'number') return false;
  if (end < today) return true;
  if (end > today) return false;

  const currentDateLabel = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  if (currentDateLabel !== todayDateLabel) return false;

  const endDateTime = dateTimeMs(event.endDate ?? event.date, event.endTime ?? event.time);
  return typeof endDateTime === 'number' && endDateTime < now.getTime();
}

function isPointInEventRange(pointDateValue: string, pointTime: string, event: CalendarEvent) {
  const point = dateTimeMs(pointDateValue, pointTime);
  const { end, start } = eventRange(event);
  if (typeof point !== 'number' || typeof start !== 'number' || typeof end !== 'number') return false;
  return end > start ? point >= start && point < end : point === start;
}

function isPointNearEventRange(pointDateValue: string, pointTime: string, event: CalendarEvent) {
  const point = dateTimeMs(pointDateValue, pointTime);
  const { end, start } = eventRange(event);
  if (typeof point !== 'number' || typeof start !== 'number' || typeof end !== 'number') return false;
  return point >= start - EVENT_WEATHER_BUFFER_MS && point <= end + EVENT_WEATHER_BUFFER_MS;
}

function pointDistance(pointDateValue: string, pointTime: string, event: CalendarEvent) {
  const point = dateTimeMs(pointDateValue, pointTime);
  const start = dateTimeMs(event.date, event.time);
  if (typeof point !== 'number' || typeof start !== 'number') return Number.MAX_SAFE_INTEGER;
  return Math.abs(point - start);
}

function pickDustPoint(event: CalendarEvent, points: DustPoint[]) {
  const inRange = points.filter((item) => isPointInEventRange(item.date, item.label, event));
  if (inRange.length > 0) {
    const worst = inRange.reduce((best, item) => (item.pm10 > best.pm10 ? item : best));
    return { basis: `${worst.label} 기준`, point: worst };
  }
  const sameDate = points.filter((item) => item.date === event.date);
  const nearest = sameDate.reduce<DustPoint | null>((best, item) => {
    if (!best) return item;
    return pointDistance(item.date, item.label, event) < pointDistance(best.date, best.label, event) ? item : best;
  }, null);
  return nearest ? { basis: `${nearest.label} 기준`, point: nearest } : { basis: '', point: undefined };
}

// 일정 시각과 이보다 멀리 떨어진 예보·관측값은 그 일정의 날씨로 쓰지 않는다.
// (예: 18시 일정에 14시 관측값 '맑음'을 쓰면, 아직 안 들어온 18시 비 예보를 가린다.)
const WEATHER_FALLBACK_LIMIT_MS = 3 * 60 * 60 * 1000;

function selectWeatherPoints(event: CalendarEvent, points: WeatherPoint[]) {
  const inRange = points.filter((item) => isPointInEventRange(item.date, item.label, event));
  if (inRange.length > 0) return { basis: '일정 시간대 예보 기준', points: inRange };

  const nearRange = points.filter((item) => isPointNearEventRange(item.date, item.label, event));
  if (nearRange.length > 0) return { basis: '일정 전후 1시간 예보 기준', points: nearRange };

  const sameDate = points.filter((item) => item.date === event.date);
  const nearest = sameDate.reduce<WeatherPoint | null>((best, item) => {
    if (!best) return item;
    return pointDistance(item.date, item.label, event) < pointDistance(best.date, best.label, event) ? item : best;
  }, null);
  return nearest && pointDistance(nearest.date, nearest.label, event) <= WEATHER_FALLBACK_LIMIT_MS
    ? { basis: `${nearest.label} 기준`, points: [nearest] }
    : { basis: '', points: [] };
}

function maxValue(values: Array<number | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === 'number');
  return numbers.length > 0 ? Math.max(...numbers) : undefined;
}

function minValue(values: Array<number | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === 'number');
  return numbers.length > 0 ? Math.min(...numbers) : undefined;
}

function aggregateWeather(points: WeatherPoint[]) {
  const temperatureMin = minValue(points.map((item) => item.temperature));
  const temperatureMax = maxValue(points.map((item) => item.temperature));
  const temperatures = [temperatureMin, temperatureMax].filter((value): value is number => typeof value === 'number');
  const temperature = temperatures.reduce<number | undefined>((selected, value) => {
    if (typeof selected !== 'number') return value;
    return Math.abs(value - 20) > Math.abs(selected - 20) ? value : selected;
  }, undefined);
  const priorityPoint = points.find((item) => isThunderLabel(item.weatherLabel))
    ?? points.find((item) => isSnowyLabel(item.weatherLabel))
    ?? points.find(rainyPoint)
    ?? points[0];

  return {
    rainMm: maxValue(points.map((item) => item.rainMm)),
    rainProbability: maxValue(points.map((item) => item.rainProbability)),
    temperature,
    temperatureMax,
    temperatureMin,
    weatherLabel: priorityPoint?.weatherLabel,
    windSpeed: maxValue(points.map((item) => item.windSpeed)),
  };
}

// 중기예보는 하루 최저·최고만 있다. 하루 평균을 쓰면 이른 아침 일정이 실제보다 따뜻하게 나와서,
// 일정 시작 시각에 맞춰 이른 아침은 최저, 한낮은 최고, 그 사이·저녁은 평균에 가깝게 고른다.
function midTermTemperatureAt(minTemperature: number | undefined, maxTemperature: number | undefined, startHour: number) {
  if (typeof minTemperature !== 'number' || typeof maxTemperature !== 'number') return maxTemperature ?? minTemperature;
  if (!Number.isFinite(startHour)) return (minTemperature + maxTemperature) / 2;
  if (startHour < 9) return minTemperature;
  if (startHour >= 12 && startHour < 18) return maxTemperature;
  return (minTemperature + maxTemperature) / 2;
}

function midTermPointForItem(item: WeatherMidTermItem, startHour: number): MidTermPoint {
  const usePm = Number.isFinite(startHour) && startHour >= 12;
  const temperature = midTermTemperatureAt(toNumber(item.minTemperature), toNumber(item.maxTemperature), startHour);
  return {
    rainProbability: toNumber(usePm ? item.rainProbabilityPm ?? item.rainProbabilityAm : item.rainProbabilityAm ?? item.rainProbabilityPm),
    temperature,
    weatherLabel: usePm ? item.weatherPm || item.weatherAm : item.weatherAm || item.weatherPm,
  };
}

function midTermSeverity(point: MidTermPoint) {
  const rain = point.rainProbability ?? 0;
  const heatCold = typeof point.temperature === 'number' ? Math.abs(point.temperature - 20) : 0;
  const labelRisk = isRainyLabel(point.weatherLabel) || isSnowyLabel(point.weatherLabel) || isThunderLabel(point.weatherLabel) ? 30 : 0;
  return rain + heatCold + labelRisk;
}

// coveredDates: 일정 시간대에 시간별 예보가 있는 날. 그날은 더 정확한 시간별 예보를 쓰고 중기예보는 보지 않는다.
// 여러 날 일정이면 시간별 예보가 없는 뒷날만 중기예보로 본다.
function midTermWeatherForEvent(event: CalendarEvent, items: WeatherMidTermItem[] | undefined, coveredDates: Set<string>): MidTermPoint | null {
  const start = dateMs(event.date);
  const end = dateMs(event.endDate ?? event.date);
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  const startHour = Number(String(event.time ?? '').slice(0, 2));
  const candidates = (items ?? [])
    .filter((forecast) => {
      const day = dateMs(forecast.date);
      return typeof day === 'number' && day >= start && day <= end && !coveredDates.has(forecast.date ?? '');
    })
    .map((item) => midTermPointForItem(item, startHour));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, item) => (midTermSeverity(item) > midTermSeverity(best) ? item : best));
}

function rainyPoint(item: WeatherPoint) {
  return isRainyLabel(item.weatherLabel)
    || (typeof item.rainMm === 'number' && item.rainMm > 0)
    || (typeof item.rainProbability === 'number' && item.rainProbability >= 60);
}

function addOneHour(label: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(label);
  if (!match) return label;
  const hour = (Number(match[1]) + 1) % 24;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

const RAIN_FREE_OFFSETS = [-1, 1, -2, 2, -3, 3];

// 하루 안의 일정이 비와 겹치면 앞뒤로 1~3시간 옮겨 예보가 있고 비가 없는 시간을 찾습니다.
function findRainFreeSuggestion(event: CalendarEvent, points: WeatherPoint[], now: Date): RainFreeSuggestion | undefined {
  if (event.endDate && event.endDate !== event.date) return undefined;
  if (!points.some((point) => isPointInEventRange(point.date, point.label, event) && rainyPoint(point))) return undefined;
  for (const offsetHours of RAIN_FREE_OFFSETS) {
    const start = addMinutesToDateTime(event.date, event.time, offsetHours * 60);
    const end = event.endTime ? addMinutesToDateTime(event.date, event.endTime, offsetHours * 60) : undefined;
    if (start.date !== event.date || (end && end.date !== event.date) || start.time < '06:00') continue;
    if ((dateTimeMs(start.date, start.time) ?? 0) < now.getTime()) continue;
    const shifted = { ...event, endTime: end?.time, time: start.time };
    const shiftedPoints = points.filter((point) => isPointInEventRange(point.date, point.label, shifted));
    if (shiftedPoints.length > 0 && !shiftedPoints.some(rainyPoint)) return { endTime: end?.time, offsetHours, time: start.time };
  }
  return undefined;
}

export function rainFreeSuggestionText({ endTime, offsetHours, time }: RainFreeSuggestion) {
  return `${Math.abs(offsetHours)}시간 ${offsetHours < 0 ? '앞당기면' : '미루면'} 비를 피할 수 있어요 (${endTime ? `${time}~${endTime}` : time})`;
}

function rainSummaryText(probability: number | undefined, timeRange: string) {
  return typeof probability === 'number'
    ? `강수 확률 ${Math.round(probability)}% ${timeRange} 예상`
    : `${timeRange} 비 예상`;
}

function matchingRiskPoints(event: CalendarEvent, points: WeatherPoint[], predicate: (point: WeatherPoint) => boolean) {
  const eventPoints = points.filter((item) => isPointInEventRange(item.date, item.label, event));
  if (eventPoints.length > 0) return eventPoints.filter(predicate);
  return points.filter((item) => isPointNearEventRange(item.date, item.label, event) && predicate(item));
}

// 하루 일정에서 그날 시간대면 시각만, 여러 날 일정이거나 다른 날이면 날짜를 붙인다(오늘 일로 읽히지 않게).
function pointsTimeRange(points: WeatherPoint[], event: CalendarEvent) {
  if (points.length === 0) return undefined;
  const sorted = [...points].sort((a, b) => `${a.date} ${a.label}`.localeCompare(`${b.date} ${b.label}`));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const singleDayEvent = (event.endDate ?? event.date) === event.date;
  if (first.date === last.date) {
    const hours = `${first.label}~${addOneHour(last.label)}`;
    return singleDayEvent && first.date === event.date ? hours : `${first.date.slice(5)} ${hours}`;
  }
  return `${first.date.slice(5)} ${first.label}~${last.date.slice(5)} ${addOneHour(last.label)}`;
}

function rainSummaryForEvent(event: CalendarEvent, points: WeatherPoint[], midTermWeather: MidTermPoint | null) {
  const rainyPoints = matchingRiskPoints(event, points, rainyPoint);
  if (rainyPoints.length > 0) {
    const maxProbability = rainyPoints.reduce<number | undefined>((best, item) => {
      if (typeof item.rainProbability !== 'number') return best;
      return typeof best === 'number' ? Math.max(best, item.rainProbability) : item.rainProbability;
    }, undefined);
    const timeRange = pointsTimeRange(rainyPoints, event) ?? '일정 시간대';
    return {
      probability: maxProbability,
      text: rainSummaryText(maxProbability, timeRange),
      timeRange,
    };
  }
  if (typeof midTermWeather?.rainProbability === 'number' && midTermWeather.rainProbability >= 60) {
    return {
      probability: midTermWeather.rainProbability,
      text: `강수 확률 ${Math.round(midTermWeather.rainProbability)}% 일정 시간대 예상`,
      timeRange: '일정 시간대',
    };
  }
  return null;
}

function weatherLabelSeverity(label?: string) {
  if (isThunderLabel(label)) return 3;
  if (isSnowyLabel(label)) return 2;
  if (isRainyLabel(label)) return 1;
  return 0;
}

// 두 날씨 이름 중 더 나쁜 쪽(천둥번개 > 눈 > 비 > 그 밖). 같으면 앞쪽(시간별 예보)을 쓴다.
function worseWeatherLabel(primary?: string, secondary?: string) {
  if (!primary) return secondary;
  return weatherLabelSeverity(secondary) > weatherLabelSeverity(primary) ? secondary : primary;
}

function isSameDateOrRangeIncludes(date: string, event: CalendarEvent) {
  const target = dateMs(date);
  const start = dateMs(event.date);
  const end = dateMs(event.endDate ?? event.date);
  if (typeof target !== 'number' || typeof start !== 'number' || typeof end !== 'number') return date === event.date;
  return target >= start && target <= end;
}

function activityIcon(event: CalendarEvent): CalendarRiskResult['icon'] {
  if (event.activityType === 'indoor') return 'home-outline';
  if (event.activityType === 'transit') return 'bus-outline';
  return 'walk-outline';
}

function levelMeta(level: CalendarRiskLevel) {
  if (level === 'good') return { badge: TEXT.good, tone: semanticColors.outing.fit.tone };
  if (level === 'watch') return { badge: TEXT.watch, tone: semanticColors.outing.info.tone };
  if (level === 'adjust') return { badge: TEXT.adjust, tone: semanticColors.outing.caution.tone };
  if (level === 'bad') return { badge: TEXT.bad, tone: semanticColors.outing.unfit.tone };
  return { badge: TEXT.unknown, tone: semanticColors.outing.unavailable.tone };
}

function isRainyLabel(label?: string) {
  return isRainyWeather(label);
}

function isThunderLabel(label?: string) {
  return isThunderWeather(label);
}

function buildAdviceLines(lines: Array<string | undefined>) {
  return lines.filter((line): line is string => !!line).join('\n');
}

function isSnowyLabel(label?: string) {
  const text = label ?? '';
  return text.includes('눈') || text.toLowerCase().includes('snow');
}

export function evaluateCalendarEventRisk(event: CalendarEvent, context: RiskContext): CalendarRiskResult {
  if (isPastEvent(event, context.todayDateLabel, context.now)) {
    return {
      badge: TEXT.past,
      basis: context.locationBasis ?? '',
      desc: '이미 지난 일정이에요.',
      icon: activityIcon(event),
      level: 'unknown',
      tone: semanticColors.outing.unavailable.tone,
    };
  }

  const dustResult = pickDustPoint(event, normalizeDustPoints(context.dustItems));
  const weatherPoints = normalizeWeatherPoints(context.weatherItems);
  const weatherResult = selectWeatherPoints(event, weatherPoints);
  const weatherAggregate = aggregateWeather(weatherResult.points);
  const coveredDates = new Set(weatherPoints.filter((point) => isPointInEventRange(point.date, point.label, event)).map((point) => point.date));
  const midTermWeather = midTermWeatherForEvent(event, context.weatherMidTermItems, coveredDates);
  const isTodayEvent = isSameDateOrRangeIncludes(context.todayDateLabel, event);
  // 현재 날씨는 지금 진행 중이거나 곧(3시간 안) 시작하는 일정에만 대신 쓴다.
  const eventStart = dateTimeMs(event.date, event.time);
  const useCurrentWeather = isTodayEvent
    && (typeof eventStart !== 'number' || eventStart - (context.now ?? new Date()).getTime() <= WEATHER_FALLBACK_LIMIT_MS);
  const dailyPredictedPm10 = dailyPredictionForEvent(event, context.prediction);
  const pm10 = dustResult.point?.pm10 ?? (isTodayEvent ? context.currentPm10 : undefined) ?? dailyPredictedPm10;
  const temperature = weatherAggregate.temperature ?? (useCurrentWeather ? context.weather?.temperature : undefined) ?? midTermWeather?.temperature;
  // 여러 날 일정은 시간별 예보(앞날)와 중기예보(뒷날)를 함께 본다.
  const temperatureMin = minValue([weatherAggregate.temperatureMin ?? temperature, midTermWeather?.temperature]);
  const temperatureMax = maxValue([weatherAggregate.temperatureMax ?? temperature, midTermWeather?.temperature]);
  const rainMm = weatherAggregate.rainMm ?? (useCurrentWeather ? context.weather?.rainMm : undefined);
  const rainSummary = rainSummaryForEvent(event, weatherPoints, midTermWeather);
  const rainProbability = maxValue([weatherAggregate.rainProbability ?? rainSummary?.probability, midTermWeather?.rainProbability]);
  const windSpeed = weatherAggregate.windSpeed ?? (useCurrentWeather ? context.weather?.windSpeed : undefined);
  const weatherLabel = worseWeatherLabel(weatherAggregate.weatherLabel ?? (useCurrentWeather ? context.weather?.label : undefined), midTermWeather?.weatherLabel);
  const rawBasis = weatherResult.basis || dustResult.basis || (typeof dailyPredictedPm10 === 'number' ? '3일 미세먼지 예측 기준' : '') || (midTermWeather ? TEXT.midTermBasis : (useCurrentWeather ? TEXT.currentBasis : TEXT.forecastNeeded));
  const basis = context.locationBasis ? context.locationBasis + ' · ' + rawBasis : rawBasis;


  if (event.activityType === 'indoor') {
    const indoorLevel: CalendarRiskLevel = typeof pm10 === 'number' && pm10 > 150 ? 'watch' : 'good';
    const meta = levelMeta(indoorLevel);
    return {
      ...meta,
      basis,
      desc: buildAdviceLines([
        indoorLevel === 'watch'
          ? '실내 일정이지만 가는 길의 공기는 한 번 확인해 주세요.'
          : '실내 일정이라 날씨 걱정은 덜어도 되겠어요.',
      ]),
      icon: activityIcon(event),
      level: indoorLevel,
      pm10,
      rainMm,
      rainProbability,
      rainTimeRange: rainSummary?.timeRange,
      temperature,
      temperatureMax,
      temperatureMin,
      weatherLabel,
      windSpeed,
    };
  }

  const dustLimit = event.sensitive ? 30 : 80;
  const highDust = typeof pm10 === 'number' && pm10 > dustLimit;
  const veryHighDust = typeof pm10 === 'number' && pm10 > (event.sensitive ? 80 : 150);
  const rainy = isRainyLabel(weatherLabel) || (typeof rainMm === 'number' && rainMm > 0) || (typeof rainProbability === 'number' && rainProbability >= 60);
  const snowyPoints = matchingRiskPoints(event, weatherPoints, (point) => isSnowyLabel(point.weatherLabel));
  const thunderPoints = matchingRiskPoints(event, weatherPoints, (point) => isThunderLabel(point.weatherLabel));
  const windyPoints = matchingRiskPoints(event, weatherPoints, (point) => typeof point.windSpeed === 'number' && point.windSpeed >= 8);
  const snowy = snowyPoints.length > 0 || isSnowyLabel(weatherLabel);
  const thunder = thunderPoints.length > 0 || isThunderLabel(weatherLabel);
  const strongWind = typeof windSpeed === 'number' && windSpeed >= 8;
  const hardTemperature = (typeof temperatureMax === 'number' && temperatureMax >= 33)
    || (typeof temperatureMin === 'number' && temperatureMin <= -5);
  const highTemperature = typeof temperatureMax === 'number' && temperatureMax >= 30;
  const lowTemperature = typeof temperatureMin === 'number' && temperatureMin <= 0;
  const hotOrCold = highTemperature || lowTemperature;
  const windTimeRange = pointsTimeRange(windyPoints, event);

  const level: CalendarRiskLevel = thunder || veryHighDust || hardTemperature || snowy || (rainy && event.activityType === 'outdoor')
    ? 'bad'
    : highDust || rainy || strongWind || hotOrCold
      ? 'adjust'
      : typeof pm10 === 'number' || typeof temperature === 'number' || weatherLabel
        ? 'good'
        : 'unknown';
  const meta = levelMeta(level);
  const reasons = [
    snowy ? '눈 예보' : '',
    lowTemperature ? '낮은 기온' : '',
    thunder ? '천둥·번개 가능성' : '',
    rainy ? '강수 가능성' : '',
    strongWind ? '강한 바람' : '',
    highTemperature ? '높은 기온' : '',
    highDust ? '미세먼지 영향' : '',
  ].filter(Boolean);
  const reasonText = reasons.length > 0 ? reasons.join(', ') : '날씨와 공기';
  const thunderNote = thunder
    ? '천둥·번개 소식이 있어요. 야외 활동은 피하는 게 좋겠어요.'
    : undefined;
  const heatNote = highTemperature
    ? '오늘은 물을 꼭 챙기세요. 햇볕이 강한 시간에는 중간중간 쉬어가세요.'
    : undefined;
  const rainNote = rainSummary ? rainSummary.text + '. 우산 챙기셨나요?' : undefined;
  const rainFreeSuggestion = rainy
    ? findRainFreeSuggestion(event, weatherPoints, context.now ?? new Date())
    : undefined;
  const rainFreeNote = rainFreeSuggestion ? rainFreeSuggestionText(rainFreeSuggestion) : undefined;
  const coldOrSnowNote = snowy || lowTemperature
    ? '나갈 때 생각보다 춥거나 눈이 올 수 있어요. 따뜻하게 입으세요.'
    : undefined;
  const windNote = strongWind
    ? `${windTimeRange ? `${windTimeRange} ` : ''}바람이 강해요. 바람막이가 있으면 좋겠어요.`
    : undefined;
  const activityNote = event.activityType === 'transit' ? '출발 전에 이동 시간을 확인해 주세요.' : '';
  const sensitiveNote = event.sensitive ? '대기질에 민감하다면 조금 더 조심하세요.' : '';
  const desc = level === 'unknown'
    ? buildAdviceLines([
      '아직 이 시간의 예보가 없어요.',
      '일정이 가까워지면 다시 확인해 주세요.',
    ])
    : level === 'good'
      ? buildAdviceLines([
        '예정대로 나가도 괜찮겠어요.',
        activityNote.trim() || undefined,
        sensitiveNote.trim() || undefined,
      ])
      : level === 'bad'
        ? buildAdviceLines([
          reasonText + ' 영향이 있어요. 나가기 전에 준비물을 확인해 주세요.',
          thunderNote,
          heatNote,
          rainNote,
          rainFreeNote,
          coldOrSnowNote,
          windNote,
          activityNote.trim() || undefined,
          sensitiveNote.trim() || undefined,
        ])
        : buildAdviceLines([
          reasonText + ' 영향이 있어요. 외출 시간이나 준비물을 조정해 보세요.',
          thunderNote,
          heatNote,
          rainNote,
          rainFreeNote,
          coldOrSnowNote,
          windNote,
          activityNote.trim() || undefined,
          sensitiveNote.trim() || undefined,
        ]);

  return {
    ...meta,
    basis,
    desc,
    icon: activityIcon(event),
    level,
    pm10,
    rainFreeSuggestion,
    rainMm,
    rainProbability,
    rainTimeRange: rainSummary?.timeRange,
    temperature,
    temperatureMax,
    temperatureMin,
    weatherLabel,
    windSpeed,
    windTimeRange,
  };
}
