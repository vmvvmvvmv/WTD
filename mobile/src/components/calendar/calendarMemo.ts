import type { MemoEvent } from '../../api/dustEndpoints';
import type { CalendarEvent } from '../../types/calendar';
import { makeCalendarId } from './calendarUtils';

const DEFAULT_NOTIFICATION_HOURS_BEFORE = 1;

// 서버가 메모에서 뽑은 일정을 앱 일정으로 바꿉니다. 장소를 못 찾았으면 이름만 남깁니다(날씨는 기본 지역 기준).
export function memoEventToCalendarEvent(item: MemoEvent): CalendarEvent {
  const place = item.place;
  return {
    activityType: item.activity_type,
    date: item.date,
    endDate: item.end_date,
    endTime: item.end_time,
    id: makeCalendarId(),
    location: place?.label || item.place_text || undefined,
    locationAddress: place?.address || undefined,
    locationLat: place?.lat,
    locationLng: place?.lng,
    locationSource: place ? place.source : undefined,
    memo: '',
    notificationHoursBefore: DEFAULT_NOTIFICATION_HOURS_BEFORE,
    sensitive: false,
    time: item.time,
    title: item.title,
  };
}

function hourLabel(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  const period = hour < 12 ? '오전' : '오후';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${displayHour}시${minute ? ` ${minute}분` : ''}`;
}

// 메모 입력 아래에 띄울 '자주·최근에 쓴 일정'. 같은 제목·시각·장소는 하나로 묶어 여러 번 쓴 것부터, 같으면 최근에 만든 것부터.
// 반복 일정은 회차마다 저장되므로 묶음당 한 번만 셉니다. 날짜는 빼서 사용자가 '내일'처럼 앞에 붙이게 합니다.
export function memoSuggestions(events: CalendarEvent[], limit = 4): string[] {
  const groups = new Map<string, { count: number; latest: number }>();
  const seenSeries = new Set<string>();
  events.forEach((event) => {
    if (event.repeatGroupId) {
      if (seenSeries.has(event.repeatGroupId)) return;
      seenSeries.add(event.repeatGroupId);
    }
    const title = event.title.trim();
    if (!title) return;
    const location = typeof event.location === 'string' ? event.location.trim() : '';
    const text = [title, hourLabel(event.time), location].filter(Boolean).join(' ');
    // id 앞부분은 만든 시각(Date.now())입니다.
    const createdAt = Number.parseInt(event.id, 10) || 0;
    const group = groups.get(text) ?? { count: 0, latest: 0 };
    groups.set(text, { count: group.count + 1, latest: Math.max(group.latest, createdAt) });
  });
  return [...groups.entries()]
    .sort(([, a], [, b]) => b.count - a.count || b.latest - a.latest)
    .slice(0, limit)
    .map(([text]) => text);
}

// 전에 적은 메모 목록에 새 메모를 맨 앞에 넣습니다. 같은 메모는 하나만 두고, 최근 limit개만 남깁니다.
export function withMemoHistory(history: string[], text: string, limit = 5): string[] {
  const memo = text.trim();
  if (!memo) return history.slice(0, limit);
  return [memo, ...history.filter((item) => item.trim() !== memo)].slice(0, limit);
}

// 반복 일정 메모("매주 월요일 9시 회의" 등). '매일유업'·'매월드'처럼 '매일·매월'로 시작하는 이름은 반복으로 보지 않는다. AI 일정 등록은 한 번짜리만 만들 수 있어, 이런 메모는 보내지 않고 직접 등록으로 안내합니다.
const REPEAT_MEMO_PATTERN = /매\s?(?:일|주|달|월|년|번)(?:(?![가-힣])|(?=[월화수목금토일]요일|아침|저녁|밤|오전|오후|말))|격주|격일|(?:요일|아침|저녁|주말|평일)\s?마다|주\s?\d\s?회/;

export function isRepeatMemo(text: string) {
  return REPEAT_MEMO_PATTERN.test(text);
}
