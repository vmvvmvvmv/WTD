import { apiClient } from './client';

export type DefaultRegion = {
  city: string;
  region: string;
};

export const DEFAULT_REGION: DefaultRegion = {
  city: '\uC11C\uC6B8',
  region: '\uC1A1\uD30C\uAD6C',
};

export type PredictionResponse = {
  future_dates: string[];
  predictions: number[];
  model?: {
    backtest?: {
      available?: boolean;
      mae?: number;
      rmse?: number;
      mape?: number;
    };
  };
};

export function getPastDust(params: {
  city?: string;
  region?: string;
  startDate: string;
  endDate: string;
}) {
  return apiClient.get('/dust/past/', {
    params: {
      city: params.city ?? DEFAULT_REGION.city,
      region: params.region ?? DEFAULT_REGION.region,
      startDate: params.startDate,
      endDate: params.endDate,
    },
  });
}

export function getPrediction(region: DefaultRegion = DEFAULT_REGION) {
  return apiClient.get<PredictionResponse>('/dust/predict/', {
    params: region,
  });
}

export function getKoreaStations() {
  return apiClient.get('/dust/korea-stations/');
}

export function sendChatMessage(message: string, region: DefaultRegion = DEFAULT_REGION) {
  return apiClient.post('/dust/chat/', {
    message,
    city: region.city,
    region: region.region,
  });
}
