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

// 서버 옷차림 추천 응답(단기예보 기반 규칙).
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
  source: 'rule';
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
