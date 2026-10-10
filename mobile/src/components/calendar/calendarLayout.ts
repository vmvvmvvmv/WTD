import type { CalendarEvent } from '../../types/dust';
import { eventRangeLength, isDateInEventRange, type CalendarMonthCell } from './calendarUtils';

export function buildCalendarEventCounts(monthCells: CalendarMonthCell[], events: CalendarEvent[]) {
  return events.reduce<Record<string, number>>((counts, event) => {
    monthCells.forEach((cell) => {
      if (cell && isDateInEventRange(cell.date, event)) counts[cell.date] = (counts[cell.date] ?? 0) + 1;
    });
    return counts;
  }, {});
}

export function buildCalendarEventLanes(monthCells: CalendarMonthCell[], events: CalendarEvent[]) {
  const items: Record<string, Array<CalendarEvent | null>> = {};
  // Multi-day events reserve the same lane across all included dates so bars do not break when another event exists.
  const eventsForLanes = [...events].sort((a, b) => {
    const rangeDiff = eventRangeLength(b) - eventRangeLength(a);
    return rangeDiff || `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
  });

  eventsForLanes.forEach((event) => {
    const dates = monthCells.flatMap((cell) => (cell && isDateInEventRange(cell.date, event) ? [cell.date] : []));
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
