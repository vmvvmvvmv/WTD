import { DEFAULT_CITY, DEFAULT_REGION } from '../../constants/dust';
import type { PredictionResponse } from '../../types/dust';

// 예측 API는 바로 응답하거나 {city: {region: ...}}로 감싸 응답합니다. 하나의 모양으로 맞춥니다.
export function normalizePredictionResponse(raw: unknown, city = DEFAULT_CITY, region = DEFAULT_REGION): PredictionResponse {
  if (!raw || typeof raw !== 'object') return {};
  const direct = raw as PredictionResponse;
  if (Array.isArray(direct.predictions)) return direct;
  const cityBucket = (raw as Record<string, unknown>)[city];
  if (!cityBucket || typeof cityBucket !== 'object') return {};
  const regionBucket = (cityBucket as Record<string, unknown>)[region];
  if (!regionBucket || typeof regionBucket !== 'object') return {};
  return regionBucket as PredictionResponse;
}
