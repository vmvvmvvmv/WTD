// ???꾩껜?먯꽌 怨듭쑀?섎뒗 ?곗씠????낆쓣 紐⑥븘???뚯씪?낅땲??
// API ?묐떟, 吏???곹깭, ?뚮┝ ?ㅼ젙泥섎읆 ?щ윭 ?붾㈃?먯꽌 ?④퍡 ?곕뒗 ??낆쓣 ?뺤쓽?⑸땲??

export type TabKey = 'home' | 'map' | 'calendar' | 'account';
export type DataMetricKey = 'pm10' | 'pm25' | 'o3' | 'no2';

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  time: string;
  endTime?: string;
  activityType: 'outdoor' | 'indoor' | 'transit';
  sensitive: boolean;
  location?: string;
  locationAddress?: string;
  locationCity?: string;
  locationLat?: number;
  locationLng?: number;
  locationRegion?: string;
  locationSource?: 'naver_map' | 'station' | 'manual' | string;
  memo?: string;
  notificationHoursBefore?: number | null;
  repeatEndDate?: string;
  repeatGroupId?: string;
  repeatMode?: 'yearly' | 'monthly' | 'weekly' | 'daily' | string;
  repeatWeekdays?: number[];
};

// ?덉륫 API ?묐떟 ?뺥깭?낅땲?? 誘몃옒 ?좎쭨? ?덉륫 ?섏튂, 紐⑤뜽 寃利??뺣낫瑜??댁뒿?덈떎.
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

// 怨쇨굅 ?쇳룊洹??곗씠????以꾩쓽 ?뺥깭?낅땲??
export type PastDustItem = {
  msurDt: string;
  pm10Value?: string | number | null;
  pm25Value?: string | number | null;
  o3Value?: string | number | null;
  no2Value?: string | number | null;
};

// ?꾩옱 誘몄꽭癒쇱? API ?묐떟 以??ㅼ젣 痢≪젙媛?遺遺꾩엯?덈떎.
// ?ㅻ뒛 ?섎（???쒓컙蹂?誘몄꽭癒쇱? 湲곕줉?낅땲??
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

// ?ㅻ뒛 ?섎（???쒓컙蹂??좎뵪 湲곕줉?낅땲??
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

export type WeatherState = {
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: number;
  rainMm?: number;
  label: string;
  measured_at?: string;
};

export type CurrentDustItem = {
  dataTime?: string;
  pm10Value?: string | number | null;
  pm25Value?: string | number | null;
  o3Value?: string | number | null;
  no2Value?: string | number | null;
  source?: string;
};

// 吏?꾩? 吏??寃?됱뿉???ъ슜?섎뒗 痢≪젙???곗씠???뺥깭?낅땲??
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

// ?깆뿉???좏깮 媛?ν븳 ????+ 援?援?痢≪젙??吏???곹깭?낅땲??
export type RegionState = {
  city: string;
  region: string;
  label?: string;
};

// ?ㅼ젙 ??뿉??愿由ы븯???몄떆 ?뚮┝ ?듭뀡?낅땲??
export type NotificationSettings = {
  enabled: boolean;
  calendarReminders: boolean;
  weatherMorningAlerts: boolean;
  // 오늘 미세먼지가 나쁨 이상으로 바뀌면 서버가 하루 한 번 푸시
  dustSpikeAlerts: boolean;
  // TODO: 利먭꺼李얘린 吏??퉴吏 ?뚮┝???ы븿?섎뒗 湲곕뒫? ?꾩슂?깆씠 ??쑝硫??쒓굅 ?꾨낫?낅땲??
  includeFavorites: boolean;
};

export type OutfitSensitivity = 'cold' | 'normal' | 'hot';
export type OutfitFigure = 'male' | 'female';

export type OutfitSettings = {
  enabled: boolean;
  figure: OutfitFigure;
  // 민감군 모드: 모든 일정 위험 판단과 활동 가이드에 미세먼지 기준을 엄격하게 적용합니다.
  // 같은 개인 설정 저장소를 쓰려고 옷차림 설정에 함께 둡니다.
  sensitiveMode: boolean;
  sensitivity: OutfitSensitivity;
};

export type OutfitRecommendation = {
  cached?: boolean;
  data_gaps: string[];
  generated_at: string;
  layering_tip: string;
  occasion?: 'running' | 'sport' | 'formal' | 'casual' | 'unknown' | string;
  must_have: Array<{
    label: string;
    level: 'required' | 'recommended';
    reason: string;
    type: 'umbrella' | 'mask' | 'windbreaker' | 'scarf_gloves' | 'waterproof_shoes' | string;
  }>;
  outfit: {
    accessories: string[];
    band: string;
    bottom: string[];
    outer: string[];
    top: string[];
  };
  outfit_note: string;
  source: 'llm' | 'rule';
  schedule_tips?: Array<{
    items: string[];
    message: string;
    schedule_id: string;
    severity: number;
    time: string;
    title: string;
    weather_condition: 'normal' | 'rain' | 'snow' | 'strong_wind' | string;
  }>;
  total_schedules?: number;
  summary: string;
  valid_until: string;
  weather_snapshot: {
    feels_avg?: number | null;
    feels_max?: number | null;
    feels_min?: number | null;
    pm10_max?: number | null;
    rain_mm_max?: number | null;
    rain_prob_max?: number | null;
    temp_range?: number | null;
    wind_max?: number | null;
    has_rain?: boolean;
    has_snow?: boolean;
    // 일정 시간대 안에서 비(또는 강수확률 60% 이상)가 있는 시간. "15:00"~"17:00"
    rain_end?: string | null;
    rain_hours?: number;
    rain_start?: string | null;
    total_hours?: number;
    weather_condition?: 'normal' | 'rain' | 'showers' | 'snow' | 'strong_wind' | string;
  };
  weather_condition?: 'normal' | 'rain' | 'showers' | 'snow' | 'strong_wind' | string;
};
