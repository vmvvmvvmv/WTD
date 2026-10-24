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
