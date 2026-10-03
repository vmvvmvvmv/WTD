import { semanticColors } from '../../theme/semanticColors';

export type AirQualityMetric = 'pm10' | 'pm25' | 'o3' | 'no2';
export type AirQualityGrade = 'good' | 'moderate' | 'bad' | 'veryBad' | 'unavailable';

const AIR_QUALITY_THRESHOLDS: Record<AirQualityMetric, readonly [number, number, number]> = {
  pm10: [30, 80, 150],
  pm25: [15, 35, 75],
  o3: [0.03, 0.09, 0.15],
  no2: [0.03, 0.06, 0.2],
};

const AIR_QUALITY_LABELS: Record<AirQualityGrade, string> = {
  good: '좋음',
  moderate: '보통',
  bad: '나쁨',
  veryBad: '매우 나쁨',
  unavailable: '대기 중',
};

export function getAirQualityGrade(metric: AirQualityMetric, value?: number): AirQualityGrade {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unavailable';
  const [goodMax, moderateMax, badMax] = AIR_QUALITY_THRESHOLDS[metric];
  if (value <= goodMax) return 'good';
  if (value <= moderateMax) return 'moderate';
  if (value <= badMax) return 'bad';
  return 'veryBad';
}

export function getAirQualityMeta(metric: AirQualityMetric, value?: number) {
  const grade = getAirQualityGrade(metric, value);
  return {
    grade,
    label: AIR_QUALITY_LABELS[grade],
    ...semanticColors.airQuality[grade],
  };
}
