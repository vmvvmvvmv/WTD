import type { Ionicons } from '@expo/vector-icons';

import type { ActivityWeatherKind } from './homeActivityGuidePresenter';

// 일정 아이콘: 활동 종류(실내·야외·이동) 대신 그 일정 시간대의 날씨를 보여줍니다(홈 활동 가이드·캘린더 날짜 시트 공통).
export const ACTIVITY_WEATHER_ICONS: Record<ActivityWeatherKind, { background: string; color: string; name: keyof typeof Ionicons.glyphMap }> = {
  clear: { background: '#FFF7E0', color: '#F3B43F', name: 'sunny' },
  cloudy: { background: '#F1F4F8', color: '#7A889C', name: 'cloudy' },
  rain: { background: '#E8F1FE', color: '#3D7FEA', name: 'rainy' },
  snow: { background: '#EAF6FD', color: '#4BA3D9', name: 'snow' },
  wind: { background: '#E9F7F0', color: '#2F9B69', name: 'flag' },
  unknown: { background: '#F1F4F8', color: '#B7C0CC', name: 'time-outline' },
};

// 예보 문구 색: 맑음·흐림은 차분한 회색, 비·눈·강풍은 아이콘 색으로 눈에 띄게.
export function activityForecastColor(kind: ActivityWeatherKind) {
  return kind === 'clear' || kind === 'cloudy' ? '#4F5D70' : ACTIVITY_WEATHER_ICONS[kind].color;
}
