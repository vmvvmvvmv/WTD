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
