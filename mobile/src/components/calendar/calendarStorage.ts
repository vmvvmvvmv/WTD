import type { CalendarEvent } from '../../types/dust';

// Calendar events are stored locally, so validate every persisted field before putting it back into app state.
export function parseStoredCalendarEvents(value: string | null): CalendarEvent[] {
  try {
    const parsed = JSON.parse(value ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((event): event is CalendarEvent => (
        !!event
        && typeof event.id === 'string'
        && typeof event.title === 'string'
        && typeof event.date === 'string'
        && typeof event.time === 'string'
        && ['outdoor', 'indoor', 'transit'].includes(event.activityType)
      ))
      .map((event) => ({
        ...event,
        endDate: typeof event.endDate === 'string' ? event.endDate : undefined,
        endTime: typeof event.endTime === 'string' ? event.endTime : undefined,
        location: typeof event.location === 'string' ? event.location : undefined,
        locationAddress: typeof event.locationAddress === 'string' ? event.locationAddress : undefined,
        locationCity: typeof event.locationCity === 'string' ? event.locationCity : undefined,
        locationLat: typeof event.locationLat === 'number' ? event.locationLat : undefined,
        locationLng: typeof event.locationLng === 'number' ? event.locationLng : undefined,
        locationRegion: typeof event.locationRegion === 'string' ? event.locationRegion : undefined,
        locationSource: typeof event.locationSource === 'string' ? event.locationSource : undefined,
        memo: typeof event.memo === 'string' ? event.memo : '',
        notificationHoursBefore: typeof event.notificationHoursBefore === 'number' ? event.notificationHoursBefore : null,
        repeatEndDate: typeof event.repeatEndDate === 'string' ? event.repeatEndDate : undefined,
        repeatGroupId: typeof event.repeatGroupId === 'string' ? event.repeatGroupId : undefined,
        repeatMode: typeof event.repeatMode === 'string' ? event.repeatMode : undefined,
        repeatWeekdays: Array.isArray(event.repeatWeekdays)
          ? event.repeatWeekdays.filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6)
          : undefined,
        sensitive: Boolean(event.sensitive),
      }));
  } catch {
    return [];
  }
}
