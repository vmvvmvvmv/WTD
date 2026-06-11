import type { CalendarEvent } from '../../types/dust';
import type { CalendarMonthCell } from './CalendarMonthGrid';

function dateTime(value: string) {
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? undefined : time;
}

export function isDateInCalendarEventRange(date: string, event: CalendarEvent) {
  const target = dateTime(date);
  const start = dateTime(event.date);
  const end = dateTime(event.endDate ?? event.date);
  if (typeof target !== 'number' || typeof start !== 'number' || typeof end !== 'number') return date === event.date;
  return target >= start && target <= end;
}

export function getCalendarEventRangeLength(event: CalendarEvent) {
  const start = dateTime(event.date);
  const end = dateTime(event.endDate ?? event.date);
  if (typeof start !== 'number' || typeof end !== 'number') return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export function buildCalendarEventCounts(monthCells: CalendarMonthCell[], events: CalendarEvent[]) {
  return events.reduce<Record<string, number>>((counts, event) => {
    monthCells.forEach((cell) => {
      if (cell && isDateInCalendarEventRange(cell.date, event)) counts[cell.date] = (counts[cell.date] ?? 0) + 1;
    });
    return counts;
  }, {});
}

export function buildCalendarEventLanes(monthCells: CalendarMonthCell[], events: CalendarEvent[]) {
  const items: Record<string, Array<CalendarEvent | null>> = {};
  // Multi-day events reserve the same lane across all included dates so bars do not break when another event exists.
  const eventsForLanes = [...events].sort((a, b) => {
    const rangeDiff = getCalendarEventRangeLength(b) - getCalendarEventRangeLength(a);
    return rangeDiff || `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
  });

  eventsForLanes.forEach((event) => {
    const dates = monthCells.flatMap((cell) => (cell && isDateInCalendarEventRange(cell.date, event) ? [cell.date] : []));
    if (!dates.length) return;
    let laneIndex = 0;
    while (dates.some((date) => items[date]?.[laneIndex])) laneIndex += 1;
    dates.forEach((date) => {
      const dateItems = items[date] ?? [];
      while (dateItems.length <= laneIndex) dateItems.push(null);
      dateItems[laneIndex] = event;
      items[date] = dateItems;
    });
  });

  return items;
}
