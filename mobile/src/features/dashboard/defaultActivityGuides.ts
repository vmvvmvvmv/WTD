import type { AppActionIconName } from '../../components/shared/AppActionIcon';
import type { WeatherHourlyItem } from '../../types/weather';
import { toNumber } from '../../utils/format';
import { isRainyWeather } from '../outing/outingIndex';
import { type BestOutingWindow, bestOutingWindowText } from './bestOutingWindow';

export type DefaultActivityGuide = {
  caution: boolean;
  detail: string;
  icon: AppActionIconName;
  key: 'outdoor' | 'indoor';
  title: string;
};

function hourOf(item: WeatherHourlyItem) {
  const hour = Number(item.hour?.slice(0, 2) ?? item.measuredAt?.slice(11, 13));
  return Number.isFinite(hour) ? hour : undefined;
}

// 일정이 없는 날, 오늘 남은 날씨로 실외·실내 두 가지 기본 가이드를 만듭니다.
export function buildDefaultActivityGuides({ bestWindow, currentPm10, nowHour, sensitive = false, todayDateLabel, weatherItems }: {
  bestWindow: BestOutingWindow | null;
  currentPm10?: number;
  nowHour: number;
  sensitive?: boolean;
  todayDateLabel: string;
  weatherItems: WeatherHourlyItem[];
}): DefaultActivityGuide[] {
  const today = weatherItems
    .map((item) => ({ hour: hourOf(item), item }))
    .filter(({ hour, item }) => (item.date || item.measuredAt?.slice(0, 10)) === todayDateLabel && hour !== undefined && hour >= nowHour)
    .sort((a, b) => (a.hour ?? 0) - (b.hour ?? 0));
  const rainHours = today
    .filter(({ item }) => isRainyWeather(item.label) || (toNumber(item.rain_mm) ?? 0) > 0 || (toNumber(item.rain_probability) ?? 0) >= 60)
    .map(({ hour }) => hour as number);
  // 가장 먼저 오는 연속된 비 시간대만 보여 줍니다(9시와 20시에 따로 오면 '9~21시'로 부풀리지 않게).
  let rainEnd = rainHours[0];
  while (rainEnd !== undefined && rainHours.includes(rainEnd + 1)) rainEnd += 1;
  const rainRange = rainHours.length ? `${rainHours[0]}~${rainEnd + 1}시` : '';
  const badDust = typeof currentPm10 === 'number' && currentPm10 > (sensitive ? 30 : 80);
  const cleanAir = typeof currentPm10 === 'number' && currentPm10 <= 30;

  const best = bestWindow ? bestOutingWindowText(bestWindow) : null;
  const outdoor: DefaultActivityGuide = best
    ? { caution: false, detail: `${best.time}가 가장 좋아요${best.details ? ` · ${best.details}` : ''}`, icon: 'activityOutdoor', key: 'outdoor', title: '산책·야외 활동' }
    : rainRange
      ? { caution: true, detail: `${rainRange} 비 예보가 있어요. 그 시간은 피해서 나가세요.`, icon: 'activityOutdoor', key: 'outdoor', title: '야외 활동은 짧게' }
      : badDust
        ? { caution: true, detail: '미세먼지가 나빠요. 밖에 오래 있지 않는 게 좋아요.', icon: 'activityOutdoor', key: 'outdoor', title: '야외 활동은 짧게' }
        : { caution: true, detail: '오늘은 밖에 오래 있기 좋은 시간이 없어요.', icon: 'activityOutdoor', key: 'outdoor', title: '야외 활동은 짧게' };

  const indoor: DefaultActivityGuide = badDust || rainRange
    ? { caution: false, detail: `${badDust ? '미세먼지' : '비'} 때문에 실내 운동·카페처럼 안에서 보내기 좋은 날이에요.`, icon: 'activityIndoor', key: 'indoor', title: '실내 활동 추천' }
    : cleanAir
      ? { caution: false, detail: '공기가 맑아요. 창문을 열어 환기하기 좋아요.', icon: 'activityIndoor', key: 'indoor', title: '환기하기 좋은 날' }
      : { caution: false, detail: '환기는 10분 정도 짧게 해 주세요.', icon: 'activityIndoor', key: 'indoor', title: '실내 활동' };

  return [outdoor, indoor];
}
