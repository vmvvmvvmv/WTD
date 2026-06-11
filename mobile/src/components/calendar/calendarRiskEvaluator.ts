import type { CalendarEvent, HourlyDustItem, PredictionResponse, WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/dust';
import { toNumber } from '../../utils/dust';
import { calculateOutingIndex, isRainyWeather, isThunderWeather } from './outingIndex';

export type CalendarRiskLevel = 'good' | 'watch' | 'adjust' | 'bad' | 'unknown';

export type CalendarRiskResult = {
  badge: string;
  basis: string;
  desc: string;
  icon: 'home-outline' | 'bus-outline' | 'walk-outline' | 'alert-circle-outline';
  level: CalendarRiskLevel;
  outingIndex?: number;
  pm10?: number;
  rainMm?: number;
  rainProbability?: number;
  rainTimeRange?: string;
  temperature?: number;
  tone: string;
  weatherLabel?: string;
  windSpeed?: number;
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
  dustItems?: HourlyDustItem[];
  locationBasis?: string;
  prediction?: PredictionResponse | null;
  todayDateLabel: string;
  weather?: WeatherState | null;
  weatherItems?: WeatherHourlyItem[];
  weatherMidTermItems?: WeatherMidTermItem[];
};

const TEXT = {
  adjust: '\uC8FC\uC758',
  bad: '\uACBD\uACE0',
  currentBasis: '\uD604\uC7AC \uAE30\uC900',
  forecastNeeded: '\uC608\uBCF4 \uD655\uC778 \uD544\uC694',
  good: '\uC88B\uC74C',
  midTermBasis: '\uC911\uAE30\uC608\uBCF4 \uAE30\uC900',
  unknown: '\uD655\uC778 \uC911',
  watch: '\uD655\uC778',
  past: '\uC9C0\uB09C \uC77C\uC815',
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

function eventDayCount(event: CalendarEvent) {
  const start = dateMs(event.date);
  const end = dateMs(event.endDate ?? event.date);
  if (typeof start !== 'number' || typeof end !== 'number' || end < start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function isPastEvent(event: CalendarEvent, todayDateLabel: string) {
  const end = dateMs(event.endDate ?? event.date);
  const today = dateMs(todayDateLabel);
  if (typeof end !== 'number' || typeof today !== 'number') return false;
  return end < today;
}

function isPointInEventRange(pointDateValue: string, pointTime: string, event: CalendarEvent) {
  const point = dateTimeMs(pointDateValue, pointTime);
  const { end, start } = eventRange(event);
  if (typeof point !== 'number' || typeof start !== 'number' || typeof end !== 'number') return false;
  return point >= start && point <= end;
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
    return { basis: `${worst.label} \uAE30\uC900`, point: worst };
  }
  const sameDate = points.filter((item) => item.date === event.date);
  const nearest = sameDate.reduce<DustPoint | null>((best, item) => {
    if (!best) return item;
    return pointDistance(item.date, item.label, event) < pointDistance(best.date, best.label, event) ? item : best;
  }, null);
  return nearest ? { basis: `${nearest.label} \uAE30\uC900`, point: nearest } : { basis: '', point: undefined };
}

function pickWeatherPoint(event: CalendarEvent, points: WeatherPoint[]) {
  const inRange = points.filter((item) => isPointInEventRange(item.date, item.label, event));
  if (inRange.length > 0) {
    const worst = inRange.reduce((best, item) => {
      const bestScore = (best.rainMm ?? 0) + ((best.rainProbability ?? 0) / 10) + (best.windSpeed ?? 0) + Math.abs((best.temperature ?? 20) - 20);
      const itemScore = (item.rainMm ?? 0) + ((item.rainProbability ?? 0) / 10) + (item.windSpeed ?? 0) + Math.abs((item.temperature ?? 20) - 20);
      return itemScore > bestScore ? item : best;
    });
    return { basis: `${worst.label} \uAE30\uC900`, point: worst };
  }
  const sameDate = points.filter((item) => item.date === event.date);
  const nearest = sameDate.reduce<WeatherPoint | null>((best, item) => {
    if (!best) return item;
    return pointDistance(item.date, item.label, event) < pointDistance(best.date, best.label, event) ? item : best;
  }, null);
  return nearest ? { basis: `${nearest.label} \uAE30\uC900`, point: nearest } : { basis: '', point: undefined };
}

function midTermWeatherForEvent(event: CalendarEvent, items?: WeatherMidTermItem[]): MidTermPoint | null {
  const item = (items ?? []).find((forecast) => forecast.date === event.date);
  if (!item) return null;
  const startHour = Number(String(event.time ?? '').slice(0, 2));
  const usePm = Number.isFinite(startHour) && startHour >= 12;
  const minTemperature = toNumber(item.minTemperature);
  const maxTemperature = toNumber(item.maxTemperature);
  const temperature = typeof minTemperature === 'number' && typeof maxTemperature === 'number'
    ? (minTemperature + maxTemperature) / 2
    : maxTemperature ?? minTemperature;
  return {
    rainProbability: toNumber(usePm ? item.rainProbabilityPm ?? item.rainProbabilityAm : item.rainProbabilityAm ?? item.rainProbabilityPm),
    temperature,
    weatherLabel: usePm ? item.weatherPm || item.weatherAm : item.weatherAm || item.weatherPm,
  };
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

function rainSummaryText(probability: number | undefined, timeRange: string) {
  return typeof probability === 'number'
    ? `\uAC15\uC218 \uD655\uB960 ${Math.round(probability)}% ${timeRange} \uC608\uC0C1`
    : `${timeRange} \uBE44 \uC608\uC0C1`;
}

function rainSummaryForEvent(event: CalendarEvent, points: WeatherPoint[], midTermWeather: MidTermPoint | null) {
  const rainyPoints = points
    .filter((item) => isPointInEventRange(item.date, item.label, event) && rainyPoint(item))
    .sort((a, b) => `${a.date} ${a.label}`.localeCompare(`${b.date} ${b.label}`));
  if (rainyPoints.length > 0) {
    const maxProbability = rainyPoints.reduce<number | undefined>((best, item) => {
      if (typeof item.rainProbability !== 'number') return best;
      return typeof best === 'number' ? Math.max(best, item.rainProbability) : item.rainProbability;
    }, undefined);
    const first = rainyPoints[0];
    const last = rainyPoints[rainyPoints.length - 1];
    const timeRange = `${first.label}~${addOneHour(last.label)}`;
    return {
      probability: maxProbability,
      text: rainSummaryText(maxProbability, timeRange),
      timeRange,
    };
  }
  if (typeof midTermWeather?.rainProbability === 'number' && midTermWeather.rainProbability >= 60) {
    return {
      probability: midTermWeather.rainProbability,
      text: `\uAC15\uC218 \uD655\uB960 ${Math.round(midTermWeather.rainProbability)}% \uC77C\uC815 \uC2DC\uAC04\uB300 \uC608\uC0C1`,
      timeRange: '\uC77C\uC815 \uC2DC\uAC04\uB300',
    };
  }
  return null;
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
  if (level === 'good') return { badge: TEXT.good, tone: '#279b64' };
  if (level === 'watch') return { badge: TEXT.watch, tone: '#2f80ed' };
  if (level === 'adjust') return { badge: TEXT.adjust, tone: '#c58a19' };
  if (level === 'bad') return { badge: TEXT.bad, tone: '#d94b4b' };
  return { badge: TEXT.unknown, tone: '#687180' };
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
  return text.includes('\uB208') || text.toLowerCase().includes('snow');
}

export function evaluateCalendarEventRisk(event: CalendarEvent, context: RiskContext): CalendarRiskResult {
  if (isPastEvent(event, context.todayDateLabel)) {
    return {
      badge: TEXT.past,
      basis: context.locationBasis ?? '',
      desc: '\uC9C0\uB09C \uC77C\uC815\uC774\uB77C \uC608\uCE21\uACFC \uD3C9\uAC00\uB294 \uD45C\uC2DC\uD558\uC9C0 \uC54A\uC544\uC694.',
      icon: activityIcon(event),
      level: 'unknown',
      tone: '#687180',
    };
  }

  const dustResult = pickDustPoint(event, normalizeDustPoints(context.dustItems));
  const weatherPoints = normalizeWeatherPoints(context.weatherItems);
  const weatherResult = pickWeatherPoint(event, weatherPoints);
  const midTermWeather = midTermWeatherForEvent(event, context.weatherMidTermItems);
  const isTodayEvent = isSameDateOrRangeIncludes(context.todayDateLabel, event);
  const dailyPredictedPm10 = dailyPredictionForEvent(event, context.prediction);
  const pm10 = dustResult.point?.pm10 ?? (isTodayEvent ? context.currentPm10 : undefined) ?? dailyPredictedPm10;
  const temperature = weatherResult.point?.temperature ?? (isTodayEvent ? context.weather?.temperature : undefined) ?? midTermWeather?.temperature;
  const rainMm = weatherResult.point?.rainMm ?? (isTodayEvent ? context.weather?.rainMm : undefined);
  const rainSummary = rainSummaryForEvent(event, weatherPoints, midTermWeather);
  const rainProbability = weatherResult.point?.rainProbability ?? rainSummary?.probability ?? midTermWeather?.rainProbability;
  const windSpeed = weatherResult.point?.windSpeed ?? (isTodayEvent ? context.weather?.windSpeed : undefined);
  const weatherLabel = weatherResult.point?.weatherLabel ?? (isTodayEvent ? context.weather?.label : undefined) ?? midTermWeather?.weatherLabel;
  const rawBasis = dustResult.basis || (typeof dailyPredictedPm10 === 'number' ? '3\uC77C \uBBF8\uC138\uBA3C\uC9C0 \uC608\uCE21 \uAE30\uC900' : '') || weatherResult.basis || (midTermWeather ? TEXT.midTermBasis : (isTodayEvent ? TEXT.currentBasis : TEXT.forecastNeeded));
  const basis = context.locationBasis ? context.locationBasis + ' \u00B7 ' + rawBasis : rawBasis;

  const outingIndex = calculateOutingIndex({ pm10, rainMm, rainProbability, temperature, weatherLabel, windSpeed });
  const outingIndexValue = typeof outingIndex === 'number' ? String(outingIndex) + '\uC810' : '\uD655\uC778 \uC911';
  const outingIndexRange = eventDayCount(event) > 1 ? ' (' + eventDayCount(event) + '\uC77C \uC77C\uC815 \uAE30\uC900)' : '';
  const outingIndexLine = '\n\uC608\uC0C1 \uC678\uCD9C \uC9C0\uC218 : ' + outingIndexValue + outingIndexRange;

  if (event.activityType === 'indoor') {
    const indoorLevel: CalendarRiskLevel = typeof pm10 === 'number' && pm10 > 150 ? 'watch' : 'good';
    const meta = levelMeta(indoorLevel);
    return {
      ...meta,
      basis,
      desc: buildAdviceLines([
        indoorLevel === 'watch'
          ? '\uC2E4\uB0B4 \uC77C\uC815\uC774\uB77C \uAD1C\uCC2E\uC9C0\uB9CC, \uC774\uB3D9 \uC804 \uACF5\uAE30 \uC0C1\uD0DC\uB294 \uD55C \uBC88 \uD655\uC778\uD558\uC138\uC694.'
          : '\uC2E4\uB0B4 \uC77C\uC815\uC774\uB77C \uD070 \uC601\uD5A5\uC740 \uC5C6\uC5B4 \uBCF4\uC5EC\uC694.',
        outingIndexLine.trim(),
      ]),
      icon: activityIcon(event),
      level: indoorLevel,
      outingIndex,
      pm10,
      rainMm,
      rainProbability,
      rainTimeRange: rainSummary?.timeRange,
      temperature,
      weatherLabel,
      windSpeed,
    };
  }

  const dustLimit = event.sensitive ? 30 : 80;
  const highDust = typeof pm10 === 'number' && pm10 > dustLimit;
  const veryHighDust = typeof pm10 === 'number' && pm10 > (event.sensitive ? 80 : 150);
  const rainy = isRainyLabel(weatherLabel) || (typeof rainMm === 'number' && rainMm > 0) || (typeof rainProbability === 'number' && rainProbability >= 60);
  const snowy = isSnowyLabel(weatherLabel);
  const thunder = isThunderLabel(weatherLabel);
  const strongWind = typeof windSpeed === 'number' && windSpeed >= 8;
  const hardTemperature = typeof temperature === 'number' && (temperature >= 33 || temperature <= -5);
  const highTemperature = typeof temperature === 'number' && temperature >= 30;
  const hotOrCold = typeof temperature === 'number' && (temperature >= 30 || temperature <= 0);

  const level: CalendarRiskLevel = thunder || veryHighDust || hardTemperature || snowy || (rainy && event.activityType === 'outdoor')
    ? 'bad'
    : highDust || rainy || strongWind || hotOrCold
      ? 'adjust'
      : typeof pm10 === 'number' || typeof temperature === 'number' || weatherLabel
        ? 'good'
        : 'unknown';
  const meta = levelMeta(level);
  const reasons = [
    highDust ? '\uBBF8\uC138\uBA3C\uC9C0 \uC601\uD5A5' : '',
    thunder ? '\uCC9C\uB465\u00B7\uBC88\uAC1C \uAC00\uB2A5\uC131' : '',
    rainy ? '\uAC15\uC218 \uAC00\uB2A5\uC131' : '',
    snowy ? '\uB208 \uC608\uBCF4' : '',
    strongWind ? '\uAC15\uD55C \uBC14\uB78C' : '',
    hotOrCold ? '\uAE30\uC628 \uBD80\uB2F4' : '',
  ].filter(Boolean);
  const reasonText = reasons.length > 0 ? reasons.join(', ') : '\uB0A0\uC528\uC640 \uACF5\uAE30';
  const thunderNote = thunder
    ? '\uCC9C\uB465\u00B7\uBC88\uAC1C \uAC00\uB2A5\uC131\uC774 \uC788\uC5B4\uC694. \uC57C\uC678 \uD65C\uB3D9\uC740 \uD53C\uD558\uACE0 \uC2E4\uB0B4\uB85C \uC774\uB3D9\uD558\uB294 \uAC8C \uC88B\uC544\uC694.'
    : undefined;
  const heatNote = highTemperature
    ? '\uC624\uB298 \uB9CE\uC774 \uB354\uC6CC\uC694. \uBB3C\uC744 \uCC59\uAE30\uACE0 \uD55C\uB0AE \uC57C\uC678\uD65C\uB3D9\uC740 \uC904\uC774\uB294 \uAC8C \uC88B\uC544\uC694.'
    : undefined;
  const rainNote = rainSummary ? rainSummary.text + '. \uC6B0\uC0B0\uC744 \uCC59\uACA8\uC8FC\uC138\uC694.' : undefined;
  const coldOrSnowNote = snowy || (typeof temperature === 'number' && temperature <= 0)
    ? '\uAE30\uC628\uC774 \uB0AE\uAC70\uB098 \uB208\uC774 \uC608\uC815\uB418\uC5B4 \uC788\uC5B4\uC694. \uC637\uC744 \uB530\uB73B\uD558\uAC8C \uC785\uC5B4\uC8FC\uC138\uC694.'
    : undefined;
  const windNote = strongWind ? '\uBC14\uB78C\uC774 \uC138\uAC8C \uBD88\uC5B4\uC694. \uC57C\uC678\uD65C\uB3D9\uC740 \uC720\uC758\uD574 \uC8FC\uC138\uC694.' : undefined;
  const activityNote = event.activityType === 'transit' ? '\uC774\uB3D9 \uC2DC\uAC04\uC744 \uD655\uC778\uD558\uC138\uC694.' : '';
  const sensitiveNote = event.sensitive ? '\uC544\uC774\uB098 \uC5B4\uB978 \uAE30\uC900\uC73C\uB85C \uC870\uAE08 \uB354 \uC870\uC2EC\uD574\uC11C \uBCF4\uC138\uC694.' : '';
  const desc = level === 'unknown'
    ? buildAdviceLines([
      '\uC544\uC9C1 \uD574\uB2F9 \uC2DC\uAC04\uB300 \uC608\uBCF4\uAC00 \uBD80\uC871\uD574\uC694.',
      '\uAC00\uAE4C\uC6B4 \uB0A0\uC5D0 \uB2E4\uC2DC \uD655\uC778\uD558\uC138\uC694.',
      outingIndexLine.trim(),
    ])
    : level === 'good'
      ? buildAdviceLines([
        '\uC9C0\uAE08 \uAE30\uC900\uC73C\uB85C\uB294 \uBB34\uB09C\uD574 \uBCF4\uC5EC\uC694.',
        activityNote.trim() || undefined,
        sensitiveNote.trim() || undefined,
        outingIndexLine.trim(),
      ])
      : level === 'bad'
        ? buildAdviceLines([
          reasonText + ' \uB54C\uBB38\uC5D0 \uC870\uC2EC\uD558\uB294 \uAC8C \uC88B\uC544\uC694.',
          thunderNote,
          heatNote,
          rainNote,
          coldOrSnowNote,
          windNote,
          activityNote.trim() || undefined,
          sensitiveNote.trim() || undefined,
          outingIndexLine.trim(),
        ])
        : buildAdviceLines([
          reasonText + ' \uB54C\uBB38\uC5D0 \uC77C\uC815 \uAC15\uB3C4\uB098 \uC2DC\uAC04\uC744 \uC870\uAE08 \uC870\uC808\uD574\uBCF4\uC138\uC694.',
          thunderNote,
          heatNote,
          rainNote,
          coldOrSnowNote,
          windNote,
          activityNote.trim() || undefined,
          sensitiveNote.trim() || undefined,
          outingIndexLine.trim(),
        ]);

  return {
    ...meta,
    basis,
    desc,
    icon: activityIcon(event),
    level,
    outingIndex,
    pm10,
    rainMm,
    rainProbability,
    rainTimeRange: rainSummary?.timeRange,
    temperature,
    weatherLabel,
    windSpeed,
  };
}
