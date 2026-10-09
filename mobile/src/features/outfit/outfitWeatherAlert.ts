import type { OutfitRecommendation } from '../../types/dust';

export type OutfitWeatherAlert = {
  detail: string;
  kind: 'rain' | 'snow' | 'wind';
  title: string;
};

// "15:00"~"17:00" -> "15~17시", 한 시간뿐이면 "15시"
export function formatRainWindow(start?: string | null, end?: string | null) {
  if (!start || !end) return '';
  const startHour = Number(start.slice(0, 2));
  const endHour = Number(end.slice(0, 2));
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return '';
  return (endHour - startHour + 24) % 24 === 1 ? `${startHour}시` : `${startHour}~${endHour}시`;
}

// 옷차림 카드 위에 띄울 날씨 주의 문구. 주의할 날씨가 없으면 null.
export function buildOutfitWeatherAlert(result: OutfitRecommendation): OutfitWeatherAlert | null {
  const snapshot = result.weather_snapshot;
  const condition = result.weather_condition ?? snapshot.weather_condition;
  const window = formatRainWindow(snapshot.rain_start, snapshot.rain_end);
  if (condition === 'snow') {
    return { detail: window ? `${window} 눈 예보가 있어요. 미끄러운 길에 주의하세요.` : '눈 예보가 있어요. 미끄러운 길에 주의하세요.', kind: 'snow', title: '눈 주의' };
  }
  if (condition === 'rain') {
    return { detail: window ? `${window} 비 예보가 있어요. 우산과 방수 겉옷을 챙기세요.` : '비 예보가 있어요. 우산과 방수 겉옷을 챙기세요.', kind: 'rain', title: '비 주의' };
  }
  if (condition === 'showers') {
    return { detail: window ? `${window} 잠깐 비 예보가 있어요. 우산을 챙기세요.` : '잠깐 비 예보가 있어요. 우산을 챙기세요.', kind: 'rain', title: '소나기 주의' };
  }
  if (condition === 'strong_wind') {
    const wind = typeof snapshot.wind_max === 'number' ? `바람이 강해요(최대 ${Math.round(snapshot.wind_max)}m/s).` : '바람이 강해요.';
    return { detail: window ? `${wind} ${window}에는 비 예보도 있어요.` : wind, kind: 'wind', title: '강풍 주의' };
  }
  return null;
}
