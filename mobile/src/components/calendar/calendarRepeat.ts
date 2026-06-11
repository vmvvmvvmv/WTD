import type { CalendarEvent } from '../../types/dust';
import { addMinutesToDateTime, formatDate, makeCalendarId, parseDateParts } from './calendarUtils';

export type CalendarRepeatMode = 'none' | 'yearly' | 'monthly' | 'weekly' | 'daily';

export type CalendarRepeatRule = {
  endDate: string;
  mode: CalendarRepeatMode;
  weekdays: number[];
};

const MAX_YEARLY_OCCURRENCES = 5;
const MAX_MONTHLY_OCCURRENCES = 24;
const MAX_DAILY_OCCURRENCES = 370;
const MAX_WEEKLY_OCCURRENCES = 160;

function addDays(date: string, amount: number) {
  const parts = parseDateParts(date);
  const next = new Date(parts.year, parts.month, parts.day + amount);
  return formatDate(next.getFullYear(), next.getMonth(), next.getDate());
}

function clampDay(year: number, month: number, day: number) {
  return Math.min(day, new Date(year, month + 1, 0).getDate());
}

function createOccurrence(base: CalendarEvent, date: string): CalendarEvent {
  const durationDays = Math.max(0, Math.round(((new Date(`${base.endDate ?? base.date}T00:00:00`).getTime()) - (new Date(`${base.date}T00:00:00`).getTime())) / 86400000));
  return {
    ...base,
    date,
    endDate: durationDays > 0 ? addDays(date, durationDays) : date,
    id: makeCalendarId(),
  };
}

export function buildRepeatedEvents(base: CalendarEvent, rule: CalendarRepeatRule) {
  if (rule.mode === 'none') return [base];

  const parts = parseDateParts(base.date);
  const events: CalendarEvent[] = [];
  const repeatGroupId = base.repeatGroupId ?? makeCalendarId();
  const repeatBase: CalendarEvent = {
    ...base,
    repeatEndDate: rule.endDate,
    repeatGroupId,
    repeatMode: rule.mode,
    repeatWeekdays: rule.weekdays,
  };

  // Hard caps prevent accidental infinite or very large local event batches when a repeat rule is misconfigured.
  if (rule.mode === 'yearly') {
    for (let index = 0; index < MAX_YEARLY_OCCURRENCES; index += 1) {
      const year = parts.year + index;
      events.push(createOccurrence(repeatBase, formatDate(year, parts.month, clampDay(year, parts.month, parts.day))));
    }
    return events;
  }

  if (rule.mode === 'monthly') {
    for (let index = 0; index < MAX_MONTHLY_OCCURRENCES; index += 1) {
      const monthDate = new Date(parts.year, parts.month + index, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      events.push(createOccurrence(repeatBase, formatDate(year, month, clampDay(year, month, parts.day))));
    }
    return events;
  }

  const limit = rule.mode === 'daily' ? MAX_DAILY_OCCURRENCES : MAX_WEEKLY_OCCURRENCES;
  let currentDate = base.date;
  for (let index = 0; index < limit && currentDate <= rule.endDate; index += 1) {
    const day = new Date(`${currentDate}T00:00:00`).getDay();
    if (rule.mode === 'daily' || rule.weekdays.includes(day)) events.push(createOccurrence(repeatBase, currentDate));
    currentDate = addDays(currentDate, 1);
  }
  return events.length > 0 ? events : [repeatBase];
}

export function nextDefaultRepeatEndDate(startDate: string) {
  return addMinutesToDateTime(startDate, '00:00', 30 * 24 * 60).date;
}
