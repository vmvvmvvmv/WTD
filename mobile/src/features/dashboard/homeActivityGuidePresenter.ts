import type { CalendarEvent } from '../../types/dust';
import type { CalendarRiskLevel, CalendarRiskResult } from '../../components/calendar/calendarRiskEvaluator';
import { semanticColors, type SemanticTone } from '../../theme/semanticColors';

export type HomeActivityGuideItem = {
  activityType: CalendarEvent['activityType'];
  advice: string;
  id: string;
  locationLabel: string;
  riskBorderTone: string;
  riskLabel: string;
  riskSoftTone: string;
  riskTone: string;
  timeLabel: string;
  title: string;
};

const RISK_PRESENTATION: Record<CalendarRiskLevel, { label: string; tone: SemanticTone }> = {
  good: { label: '적합', tone: semanticColors.outing.fit },
  watch: { label: '확인', tone: semanticColors.outing.info },
  adjust: { label: '주의', tone: semanticColors.outing.caution },
  bad: { label: '부적합', tone: semanticColors.outing.unfit },
  unknown: { label: '확인 중', tone: semanticColors.outing.unavailable },
};

function includesWeather(label: string | undefined, words: string[]) {
  const normalized = label?.toLowerCase() ?? '';
  return words.some((word) => normalized.includes(word));
}

function buildAdvice(event: CalendarEvent, risk: CalendarRiskResult) {
  if (risk.level === 'unknown') return '해당 시간대 예보를 확인하고 있어요.';

  const hasSnow = includesWeather(risk.weatherLabel, ['눈', 'snow']);
  if (hasSnow || (risk.temperature !== undefined && risk.temperature <= 0)) {
    return '방한용품을 챙기고 미끄러운 길에 주의하세요.';
  }

  const hasRain = includesWeather(risk.weatherLabel, ['비', '소나기', 'rain', 'shower'])
    || Boolean(risk.rainTimeRange)
    || (risk.rainProbability ?? 0) >= 60
    || (risk.rainMm ?? 0) > 0;
  if (hasRain) return '우산을 챙기고 이동 시간을 여유 있게 잡으세요.';

  if ((risk.windSpeed ?? 0) >= 8) return '강한 바람에 주의하고 야외 활동을 줄이세요.';
  if ((risk.pm10 ?? 0) > (event.sensitive ? 30 : 80)) return '마스크를 챙기고 장시간 야외 활동을 줄이세요.';
  if (risk.level === 'bad') return '가능하면 외출 시간이나 일정을 조정하세요.';
  if (risk.level === 'adjust') return '외출 전 날씨와 대기질을 한 번 더 확인하세요.';
  if (event.activityType === 'indoor') return '실내 일정이라 날씨 영향이 크지 않아요.';
  return '예정대로 활동하기 좋은 상태예요.';
}

export function buildHomeActivityGuideItems(
  events: CalendarEvent[],
  riskByEvent: Record<string, CalendarRiskResult>,
): HomeActivityGuideItem[] {
  return events.flatMap((event) => {
    const risk = riskByEvent[event.id];
    if (!risk) return [];

    const presentation = RISK_PRESENTATION[risk.level];
    const location = [event.locationCity, event.locationRegion].filter(Boolean).join(' ') || event.location || '';
    return [{
      activityType: event.activityType,
      advice: buildAdvice(event, risk),
      id: event.id,
      locationLabel: location ? `${location} 기준` : '',
      riskBorderTone: presentation.tone.border,
      riskLabel: presentation.label,
      riskSoftTone: presentation.tone.soft,
      riskTone: presentation.tone.tone,
      timeLabel: event.endTime ? `${event.time}~${event.endTime}` : event.time,
      title: event.title,
    }];
  });
}
