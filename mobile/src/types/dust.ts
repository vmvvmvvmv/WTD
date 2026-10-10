export type DataMetricKey = 'pm10' | 'pm25' | 'o3' | 'no2';

// 예측 API 응답: 미래 날짜별 예측값과 모델 검증 정보.
export type PredictionResponse = {
  future_dates?: string[];
  predictions?: number[];
  model?: {
    backtest?: {
      available?: boolean;
      mae?: number;
    };
  };
};

// 과거 하루 평균 한 줄.
export type PastDustItem = {
  msurDt: string;
  pm10Value?: string | number | null;
  pm25Value?: string | number | null;
  o3Value?: string | number | null;
  no2Value?: string | number | null;
};

// 오늘 시간별 미세먼지(측정 또는 예보).
export type HourlyDustItem = {
  measuredAt?: string;
  date?: string;
  hour?: string;
  pm10Value?: string | number | null;
  pm25Value?: string | number | null;
  o3Value?: string | number | null;
  no2Value?: string | number | null;
  phase?: 'stored' | 'forecast' | string;
  source?: string;
};

// 지금 측정값.
export type CurrentDustItem = {
  dataTime?: string;
  pm10Value?: string | number | null;
  pm25Value?: string | number | null;
  o3Value?: string | number | null;
  no2Value?: string | number | null;
  source?: string;
};

// 지도·지역 검색에 쓰는 측정소(공기질 + 날씨).
export type StationDustItem = {
  name?: string;
  sido?: string;
  city?: string;
  addr?: string;
  pm10?: string | number | null;
  pm25?: string | number | null;
  no2?: string | number | null;
  o3?: string | number | null;
  time?: string;
  weatherTemperature?: string | number | null;
  weatherHumidity?: string | number | null;
  weatherWindSpeed?: string | number | null;
  weatherWindDirection?: string | number | null;
  weatherRainMm?: string | number | null;
  weatherLabel?: string;
  weatherTime?: string;
  lat?: number;
  lng?: number;
};
