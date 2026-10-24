import type { CalendarEvent } from '../../types/calendar';
import { type CalendarRiskLevel, type CalendarRiskResult, rainFreeSuggestionText } from '../../components/calendar/calendarRiskEvaluator';
import { semanticColors, type SemanticTone } from '../../theme/semanticColors';
import { isThunderWeather } from '../outing/outingIndex';
import { getWeatherVisualKind } from '../../utils/weather';

export type ActivityWeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow' | 'thunder' | 'wind' | 'unknown';

export type HomeActivityGuideItem = {
  activityType: CalendarEvent['activityType'];
  advice: string;
  // 일정 시간대의 예보를 한 줄로: "15:00~17:00 비 예보 · 강수 70%", "맑음 · 18°"
  forecastLabel: string;
  id: string;
  isCompleted: boolean;
  locationLabel: string;
  riskBorderTone: string;
  riskLabel: string;
  riskSoftTone: string;
  riskTone: string;
  timeLabel: string;
  title: string;
  weatherKind: ActivityWeatherKind;
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

function buildAdvice(event: CalendarEvent, risk: CalendarRiskResult, sensitiveMode: boolean) {
  if (risk.level === 'unknown') return '아직 예보가 없어요. 가까운 날 다시 확인해 주세요.';
  if (!hasWeatherForecast(risk)) return '예보가 들어오면 여기에 바로 반영돼요.';

  const hasSnow = includesWeather(risk.weatherLabel, ['눈', 'snow']);
  if (hasSnow) return '눈길이 미끄러울 수 있어요. 따뜻하게 입고 조심히 이동하세요.';
  if (risk.temperature !== undefined && risk.temperature <= 0) return '영하로 추워요. 따뜻하게 입고 나가세요.';

  if (risk.rainFreeSuggestion) return rainFreeSuggestionText(risk.rainFreeSuggestion);
  if (hasRainRisk(risk)) return '우산 챙기셨나요? 이동 시간도 조금 여유 있게 잡으세요.';

  if ((risk.windSpeed ?? 0) >= 8) return '바람이 강해요. 바람막이가 있으면 좋겠어요.';
  if ((risk.pm10 ?? 0) > (event.sensitive || sensitiveMode ? 30 : 80)) return '오늘은 마스크를 챙기고 오래 밖에 있지 마세요.';
  if (risk.level === 'bad') return '가능하면 외출 시간을 조금 조정해 보세요.';
  if (risk.level === 'adjust') return '나가기 전에 날씨와 공기를 한 번 더 확인해 주세요.';
  if (event.activityType === 'indoor') return '실내 일정이라 날씨 걱정은 덜어도 되겠어요.';
  return '예정대로 나가도 괜찮겠어요.';
}

function hasRainRisk(risk: CalendarRiskResult) {
  return includesWeather(risk.weatherLabel, ['비', '소나기', 'rain', 'shower'])
    || Boolean(risk.rainTimeRange)
    || (risk.rainProbability ?? 0) >= 60
    || (risk.rainMm ?? 0) > 0;
}

// 날씨 예보(상태·기온·비·바람)가 하나도 없으면 미세먼지만으로 '맑음'이라고 단정하지 않는다.
function hasWeatherForecast(risk: CalendarRiskResult) {
  return Boolean(risk.weatherLabel) || typeof risk.temperature === 'number' || hasRainRisk(risk) || typeof risk.windSpeed === 'number';
}

export function activityWeatherKind(risk: CalendarRiskResult): ActivityWeatherKind {
  if (risk.level === 'unknown' || !hasWeatherForecast(risk)) return 'unknown';
  if (isThunderWeather(risk.weatherLabel)) return 'thunder'; // 가장 위험해서 비·눈보다 먼저 보여 준다.
  if (includesWeather(risk.weatherLabel, ['눈', 'snow'])) return 'snow';
  if (hasRainRisk(risk)) return 'rain';
  if ((risk.windSpeed ?? 0) >= 8) return 'wind';
  return getWeatherVisualKind(risk.weatherLabel) === 'cloudy' ? 'cloudy' : 'clear';
}

export function activityForecastLabel(risk: CalendarRiskResult): string {
  const kind = activityWeatherKind(risk);
  const range = risk.rainTimeRange && risk.rainTimeRange !== '일정 시간대' ? risk.rainTimeRange : '';
  const probability = typeof risk.rainProbability === 'number' ? ` · 강수 ${Math.round(risk.rainProbability)}%` : '';
  if (kind === 'unknown') return risk.level === 'unknown' ? '' : '이 시간대 날씨 예보를 아직 받지 못했어요';
  if (kind === 'thunder') return `${range ? `${range} ` : ''}천둥번개 예보`;
  if (kind === 'snow') return `${range ? `${range} ` : '일정 중 '}눈 예보${probability}`;
  if (kind === 'rain') return `${range ? `${range} ` : '일정 중 '}비 예보${probability}`;
  if (kind === 'wind') {
    return `${risk.windTimeRange ? `${risk.windTimeRange} ` : ''}강풍 · 최대 ${Math.round(risk.windSpeed ?? 0)}m/s`;
  }
  const temperature = typeof risk.temperature === 'number' ? ` · ${Math.round(risk.temperature)}°` : '';
  return `${risk.weatherLabel || (kind === 'cloudy' ? '흐림' : '맑음')}${temperature}`;
}

// 여러 날 일정은 날짜를 붙인다(비 시간대 문구와 같은 형식: 10-24 09:00~10-26 18:00).
function timeLabel(event: CalendarEvent) {
  const endDate = event.endDate ?? event.date;
  if (endDate === event.date) return event.endTime ? `${event.time}~${event.endTime}` : event.time;
  return `${event.date.slice(5)} ${event.time}~${endDate.slice(5)} ${event.endTime ?? ''}`.trim();
}

function isEventCompleted(event: CalendarEvent, currentDate: string, currentTime: string) {
  const spansMultipleDays = Boolean(event.endDate && event.endDate !== event.date);
  const completionDate = spansMultipleDays ? event.endDate! : event.date;
  // 끝나는 시각이 지나야 완료다. 진행 중에는 날씨 위험 표시를 계속 보여 준다.
  const completionTime = event.endTime ?? (spansMultipleDays ? '23:59' : event.time);
  if (completionDate < currentDate) return true;
  if (completionDate > currentDate) return false;
  return completionTime.slice(0, 5) <= currentTime;
}

export function buildHomeActivityGuideItems(
  events: CalendarEvent[],
  riskByEvent: Record<string, CalendarRiskResult>,
  currentDate: string,
  currentTime: string,
  sensitiveMode = false,
): HomeActivityGuideItem[] {
  return events.flatMap((event) => {
    const risk = riskByEvent[event.id];
    if (!risk) return [];

    const presentation = RISK_PRESENTATION[risk.level];
    const location = [event.locationCity, event.locationRegion].filter(Boolean).join(' ') || event.location || '';
    return [{
      activityType: event.activityType,
      advice: buildAdvice(event, risk, sensitiveMode),
      forecastLabel: activityForecastLabel(risk),
      id: event.id,
      isCompleted: isEventCompleted(event, currentDate, currentTime),
      locationLabel: location ? `${location} 기준` : '',
      riskBorderTone: presentation.tone.border,
      riskLabel: presentation.label,
      riskSoftTone: presentation.tone.soft,
      riskTone: presentation.tone.tone,
      timeLabel: timeLabel(event),
      title: event.title,
      weatherKind: activityWeatherKind(risk),
    }];
  });
}
