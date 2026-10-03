import type { PastDustItem, WeatherState } from '../../types/dust';
import { semanticColors } from '../../theme/semanticColors';
import { toNumber } from '../../utils/dust';
import { getAirQualityMeta } from '../airQuality/airQualityGrade';
import { calculateOutingIndex, getOutingGrade, getOutingTone } from '../outing/outingIndex';

export type HomeMetricSlide = {
  comparison: string;
  gaugeSize: number;
  label: string;
  progress: number;
  status: string;
  title: string;
  tone: string;
  unit: string;
  value: string;
};

type BuildHomeMetricSlidesInput = {
  currentO3?: number;
  currentPm10?: number;
  currentPm25?: number;
  gaugeSize: number;
  pastItems: PastDustItem[];
  todayDateLabel: string;
  weather?: WeatherState | null;
  yesterdayWeather?: WeatherState | null;
};

function rangeStatus(value: number | undefined, good: (value: number) => boolean, normal: (value: number) => boolean, caution: (value: number) => boolean) {
  if (typeof value !== 'number') return { status: '확인 중', tone: semanticColors.weather.unavailable.tone };
  if (good(value)) return { status: '좋음', tone: semanticColors.weather.normal.tone };
  if (normal(value)) return { status: '보통', tone: semanticColors.weather.normal.tone };
  if (caution(value)) return { status: '주의', tone: semanticColors.weather.caution.tone };
  return { status: '심각', tone: semanticColors.weather.danger.tone };
}

function gaugeProgress(value: number | undefined, max: number) {
  return typeof value === 'number' ? Math.max(0.04, Math.min(1, Math.abs(value) / max)) : 0.04;
}

function metricValue(value: string | number | null | undefined, decimals: number) {
  const numericValue = toNumber(value);
  return typeof numericValue === 'number' ? numericValue.toFixed(decimals) : '-';
}

function yesterdayComparison(current: number | undefined, yesterday: number | undefined, unit: string, decimals = 0) {
  if (typeof current !== 'number' || typeof yesterday !== 'number') return '어제 비교 데이터 없음';
  const difference = current - yesterday;
  const roundedDifference = Number(Math.abs(difference).toFixed(decimals));
  if (roundedDifference === 0) return '어제와 같아요';
  return `어제보다 ${roundedDifference}${unit} ${difference > 0 ? '높아요' : '낮아요'}`;
}

export function buildHomeMetricSlides({ currentO3, currentPm10, currentPm25, gaugeSize, pastItems, todayDateLabel, weather, yesterdayWeather }: BuildHomeMetricSlidesInput): HomeMetricSlide[] {
  const yesterdayDate = new Date(`${todayDateLabel}T12:00:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayDateKey = [yesterdayDate.getFullYear(), String(yesterdayDate.getMonth() + 1).padStart(2, '0'), String(yesterdayDate.getDate()).padStart(2, '0')].join('');
  const yesterdayDust = pastItems.find((item) => item.msurDt.replace(/\D/g, '').slice(0, 8) === yesterdayDateKey);
  const yesterdayPm10 = toNumber(yesterdayDust?.pm10Value);
  const yesterdayPm25 = toNumber(yesterdayDust?.pm25Value);
  const yesterdayO3 = toNumber(yesterdayDust?.o3Value);
  const outingIndex = calculateOutingIndex({ pm10: currentPm10, rainMm: weather?.rainMm, temperature: weather?.temperature, weatherLabel: weather?.label, windSpeed: weather?.windSpeed });
  const yesterdayOutingIndex = calculateOutingIndex({ pm10: yesterdayPm10, rainMm: yesterdayWeather?.rainMm, temperature: yesterdayWeather?.temperature, weatherLabel: yesterdayWeather?.label, windSpeed: yesterdayWeather?.windSpeed });
  const temperature = rangeStatus(weather?.temperature, (v) => v >= 10 && v <= 25, (v) => v >= 5 && v <= 30, (v) => v >= 0 && v <= 35);
  const humidity = rangeStatus(weather?.humidity, (v) => v >= 40 && v <= 60, (v) => v >= 30 && v <= 70, (v) => v >= 20 && v <= 80);
  const wind = rangeStatus(weather?.windSpeed, (v) => v < 4, (v) => v < 8, (v) => v < 13);
  const rain = rangeStatus(weather?.rainMm, (v) => v === 0, (v) => v < 1, (v) => v < 5);
  const pm10 = getAirQualityMeta('pm10', currentPm10);
  const pm25 = getAirQualityMeta('pm25', currentPm25);
  const o3 = getAirQualityMeta('o3', currentO3);
  return [
    { comparison: yesterdayComparison(outingIndex, yesterdayOutingIndex, '점'), gaugeSize, label: '외출지수', progress: gaugeProgress(outingIndex, 100), status: getOutingGrade(outingIndex), title: '외출지수', tone: getOutingTone(outingIndex), unit: '점', value: outingIndex === undefined ? '--' : String(outingIndex) },
    { comparison: yesterdayComparison(weather?.temperature, yesterdayWeather?.temperature, '°'), gaugeSize, label: '기온', progress: gaugeProgress(weather?.temperature, 40), status: temperature.status, title: weather?.label ?? '날씨 확인 중', tone: temperature.tone, unit: '°', value: metricValue(weather?.temperature, 0) },
    { comparison: yesterdayComparison(weather?.humidity, yesterdayWeather?.humidity, '%'), gaugeSize, label: '습도', progress: gaugeProgress(weather?.humidity, 100), status: humidity.status, title: '습도', tone: humidity.tone, unit: '%', value: metricValue(weather?.humidity, 0) },
    { comparison: yesterdayComparison(weather?.windSpeed, yesterdayWeather?.windSpeed, 'm/s', 1), gaugeSize, label: '풍속', progress: gaugeProgress(weather?.windSpeed, 20), status: wind.status, title: '풍속', tone: wind.tone, unit: 'm/s', value: metricValue(weather?.windSpeed, 1) },
    { comparison: yesterdayComparison(weather?.rainMm, yesterdayWeather?.rainMm, 'mm', 1), gaugeSize, label: '강수량', progress: gaugeProgress(weather?.rainMm, 20), status: rain.status, title: '강수량', tone: rain.tone, unit: 'mm', value: metricValue(weather?.rainMm, 1) },
    { comparison: yesterdayComparison(currentPm10, yesterdayPm10, '㎍/m³'), gaugeSize, label: 'PM10', progress: gaugeProgress(currentPm10, 150), status: pm10.label, title: '미세먼지', tone: pm10.tone, unit: 'µg/m³', value: metricValue(currentPm10, 0) },
    { comparison: yesterdayComparison(currentPm25, yesterdayPm25, '㎍/m³'), gaugeSize, label: 'PM2.5', progress: gaugeProgress(currentPm25, 75), status: pm25.label, title: '초미세먼지', tone: pm25.tone, unit: 'µg/m³', value: metricValue(currentPm25, 0) },
    { comparison: yesterdayComparison(currentO3, yesterdayO3, 'ppm', 3), gaugeSize, label: 'O3', progress: gaugeProgress(currentO3, 0.15), status: o3.label, title: '오존', tone: o3.tone, unit: 'ppm', value: metricValue(currentO3, 3) },
  ];
}
