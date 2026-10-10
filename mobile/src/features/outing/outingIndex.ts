export type OutingIndexInput = {
  pm10?: number;
  rainMm?: number;
  rainProbability?: number;
  temperature?: number;
  weatherLabel?: string;
  windSpeed?: number;
};

const OUTING_INDEX = {
  baseScore: 100,
  dust: { moderatePenalty: 16, moderatePm10: 30, badPenalty: 36, badPm10: 80, veryBadPenalty: 48, veryBadPm10: 150 },
  rainPenalty: 16,
  thunderPenalty: 28,
  rainProbabilityThreshold: 60,
  windPenalty: 12,
  windSpeedThreshold: 8,
  temperature: { hardPenalty: 15, hotPenalty: 8, hotThreshold: 30, veryHotThreshold: 33, coldThreshold: 0, veryColdThreshold: -5 },
} as const;

export function clampOutingIndex(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function isRainyWeather(label?: string) {
  if (!label) return false;
  const lowerLabel = label.toLowerCase();
  return label.includes('비') || label.includes('눈') || lowerLabel.includes('rain') || lowerLabel.includes('snow');
}

export function isThunderWeather(label?: string) {
  if (!label) return false;
  const lowerLabel = label.toLowerCase();
  return label.includes('천둥') || label.includes('번개') || label.includes('낙뢰') || label.includes('뇌우')
    || lowerLabel.includes('thunder') || lowerLabel.includes('lightning') || lowerLabel.includes('storm');
}

export function calculateOutingIndex({ pm10, rainMm, rainProbability, temperature, weatherLabel, windSpeed }: OutingIndexInput) {
  const hasData = typeof pm10 === 'number' || typeof temperature === 'number' || typeof rainMm === 'number'
    || typeof rainProbability === 'number' || typeof windSpeed === 'number' || !!weatherLabel;
  if (!hasData) return undefined;
  let score = OUTING_INDEX.baseScore;
  if (typeof pm10 === 'number') {
    if (pm10 > OUTING_INDEX.dust.veryBadPm10) score -= OUTING_INDEX.dust.veryBadPenalty;
    else if (pm10 > OUTING_INDEX.dust.badPm10) score -= OUTING_INDEX.dust.badPenalty;
    else if (pm10 > OUTING_INDEX.dust.moderatePm10) score -= OUTING_INDEX.dust.moderatePenalty;
  }
  if (isThunderWeather(weatherLabel)) score -= OUTING_INDEX.thunderPenalty;
  if (isRainyWeather(weatherLabel) || (typeof rainMm === 'number' && rainMm > 0)
    || (typeof rainProbability === 'number' && rainProbability >= OUTING_INDEX.rainProbabilityThreshold)) score -= OUTING_INDEX.rainPenalty;
  if (typeof windSpeed === 'number' && windSpeed >= OUTING_INDEX.windSpeedThreshold) score -= OUTING_INDEX.windPenalty;
  if (typeof temperature === 'number') {
    if (temperature >= OUTING_INDEX.temperature.veryHotThreshold || temperature <= OUTING_INDEX.temperature.veryColdThreshold) score -= OUTING_INDEX.temperature.hardPenalty;
    else if (temperature >= OUTING_INDEX.temperature.hotThreshold || temperature <= OUTING_INDEX.temperature.coldThreshold) score -= OUTING_INDEX.temperature.hotPenalty;
  }
  return clampOutingIndex(score);
}
