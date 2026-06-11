export type OutingIndexInput = {
  pm10?: number | undefined;
  rainMm?: number | undefined;
  rainProbability?: number | undefined;
  temperature?: number | undefined;
  weatherLabel?: string | undefined;
  windSpeed?: number | undefined;
};

const OUTING_INDEX = {
  baseScore: 100,
  dust: {
    moderatePenalty: 16,
    moderatePm10: 30,
    badPenalty: 36,
    badPm10: 80,
    veryBadPenalty: 48,
    veryBadPm10: 150,
  },
  rainPenalty: 16,
  thunderPenalty: 28,
  rainProbabilityThreshold: 60,
  windPenalty: 12,
  windSpeedThreshold: 8,
  temperature: {
    hardPenalty: 15,
    hotPenalty: 8,
    hotThreshold: 30,
    veryHotThreshold: 33,
    coldThreshold: 0,
    veryColdThreshold: -5,
  },
} as const;

export function clampOutingIndex(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function isRainyWeather(label?: string) {
  if (!label) return false;
  const lowerLabel = label.toLowerCase();
  return label.includes('\uBE44') || label.includes('\uB208') || lowerLabel.includes('rain') || lowerLabel.includes('snow');
}

export function isThunderWeather(label?: string) {
  if (!label) return false;
  const lowerLabel = label.toLowerCase();
  return label.includes('\uCC9C\uB465')
    || label.includes('\uBC88\uAC1C')
    || label.includes('\uB099\uB8B0')
    || label.includes('\uB1CC\uC6B0')
    || lowerLabel.includes('thunder')
    || lowerLabel.includes('lightning')
    || lowerLabel.includes('storm');
}

export function calculateOutingIndex({
  pm10,
  rainMm,
  rainProbability,
  temperature,
  weatherLabel,
  windSpeed,
}: OutingIndexInput) {
  const hasData = typeof pm10 === 'number'
    || typeof temperature === 'number'
    || typeof rainMm === 'number'
    || typeof rainProbability === 'number'
    || typeof windSpeed === 'number'
    || !!weatherLabel;
  if (!hasData) return undefined;

  let score = OUTING_INDEX.baseScore;

  // PM10 follows the same broad breakpoints used elsewhere in the app: 30, 80, 150.
  if (typeof pm10 === 'number') {
    if (pm10 > OUTING_INDEX.dust.veryBadPm10) score -= OUTING_INDEX.dust.veryBadPenalty;
    else if (pm10 > OUTING_INDEX.dust.badPm10) score -= OUTING_INDEX.dust.badPenalty;
    else if (pm10 > OUTING_INDEX.dust.moderatePm10) score -= OUTING_INDEX.dust.moderatePenalty;
  }

  if (isThunderWeather(weatherLabel)) {
    score -= OUTING_INDEX.thunderPenalty;
  }

  if (
    isRainyWeather(weatherLabel)
    || (typeof rainMm === 'number' && rainMm > 0)
    || (typeof rainProbability === 'number' && rainProbability >= OUTING_INDEX.rainProbabilityThreshold)
  ) {
    score -= OUTING_INDEX.rainPenalty;
  }

  if (typeof windSpeed === 'number' && windSpeed >= OUTING_INDEX.windSpeedThreshold) {
    score -= OUTING_INDEX.windPenalty;
  }

  if (typeof temperature === 'number') {
    if (
      temperature >= OUTING_INDEX.temperature.veryHotThreshold
      || temperature <= OUTING_INDEX.temperature.veryColdThreshold
    ) {
      score -= OUTING_INDEX.temperature.hardPenalty;
    } else if (
      temperature >= OUTING_INDEX.temperature.hotThreshold
      || temperature <= OUTING_INDEX.temperature.coldThreshold
    ) {
      score -= OUTING_INDEX.temperature.hotPenalty;
    }
  }

  return clampOutingIndex(score);
}

export function getOutingGrade(score?: number) {
  if (typeof score !== 'number') return '\uD655\uC778 \uC911';
  if (score >= 82) return '\uC88B\uC74C';
  if (score >= 62) return '\uBB34\uB09C';
  if (score >= 42) return '\uC8FC\uC758';
  return '\uACBD\uACE0';
}

export function getOutingTone(score?: number) {
  if (typeof score !== 'number') return '#687180';
  if (score >= 82) return '#279b64';
  if (score >= 62) return '#2f80ed';
  if (score >= 42) return '#c58a19';
  return '#d94b4b';
}


export function getOutingSoftTone(score?: number) {
  const tone = getOutingTone(score);
  if (tone === '#279b64') return '#e7f6ed';
  if (tone === '#2f80ed') return '#eaf3ff';
  if (tone === '#c58a19') return '#fff4df';
  if (tone === '#d94b4b') return '#fdecec';
  return '#eef1f5';
}

export function getOutingBorderTone(score?: number) {
  const tone = getOutingTone(score);
  if (tone === '#279b64') return '#bfe8cf';
  if (tone === '#2f80ed') return '#c8ddfb';
  if (tone === '#c58a19') return '#efd6a8';
  if (tone === '#d94b4b') return '#f1bbbb';
  return '#d9dee5';
}
