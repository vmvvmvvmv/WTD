import type { WeatherIconKind } from '../../components/shared/WeatherIcon';
import type { ActivityWeatherKind } from './homeActivityGuidePresenter';

// 일정 아이콘: 활동 종류(실내·야외·이동) 대신 그 일정 시간대의 날씨를 보여줍니다(홈 활동 가이드·캘린더 날짜 시트 공통).
export const ACTIVITY_WEATHER_ICONS: Record<ActivityWeatherKind, { background: string; color: string; kind: WeatherIconKind }> = {
  clear: { background: '#FFF7E0', color: '#F3B43F', kind: 'clear' },
  cloudy: { background: '#F1F4F8', color: '#7A889C', kind: 'cloudy' },
  rain: { background: '#E8F1FE', color: '#3D7FEA', kind: 'rain' },
  snow: { background: '#EAF6FD', color: '#4BA3D9', kind: 'snow' },
  wind: { background: '#E9F7F0', color: '#2F9B69', kind: 'wind' },
  unknown: { background: '#F1F4F8', color: '#B7C0CC', kind: 'unknown' },
};

// 예보 문구 색: 맑음·흐림은 차분한 회색, 비·눈·강풍은 아이콘 색으로 눈에 띄게.
export function activityForecastColor(kind: ActivityWeatherKind) {
  return kind === 'clear' || kind === 'cloudy' ? '#4F5D70' : ACTIVITY_WEATHER_ICONS[kind].color;
}
