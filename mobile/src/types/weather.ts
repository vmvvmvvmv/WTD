// 오늘 시간별 날씨(측정 또는 예보).
export type WeatherHourlyItem = {
  measuredAt?: string;
  date?: string;
  hour?: string;
  temperature?: string | number | null;
  humidity?: string | number | null;
  wind_speed?: string | number | null;
  wind_direction?: string | number | null;
  rain_mm?: string | number | null;
  rain_probability?: string | number | null;
  label?: string;
  sky?: string;
  precipitation_type?: string;
  phase?: 'stored' | 'forecast' | string;
  source?: string;
};

// 기상청 중기 예보(3~10일, 오전/오후).
export type WeatherMidTermItem = {
  date?: string;
  announcedAt?: string;
  regionKey?: string;
  regionLabel?: string;
  landRegId?: string;
  tempRegId?: string;
  minTemperature?: string | number | null;
  maxTemperature?: string | number | null;
  weatherAm?: string;
  weatherPm?: string;
  rainProbabilityAm?: string | number | null;
  rainProbabilityPm?: string | number | null;
  source?: string;
};

// 화면에 보여줄 지금 날씨.
export type WeatherState = {
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: number;
  rainMm?: number;
  label: string;
  measured_at?: string;
};
