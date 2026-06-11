import type { CalendarEvent } from '../../types/dust';

export const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
export const minuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));

export function makeCalendarId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function dateTime(value: string) {
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? undefined : time;
}

export function parseDateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const fallback = new Date();
  return {
    day: Number.isFinite(day) ? day : 1,
    month: Number.isFinite(month) ? month - 1 : fallback.getMonth(),
    year: Number.isFinite(year) ? year : fallback.getFullYear(),
  };
}

export function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function monthLabel(year: number, month: number) {
  return `${year}년 ${month + 1}월`;
}

export function buildMonthCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: string; day: number; inMonth: boolean } | null> = [];
  for (let index = 0; index < firstDay; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: formatDate(year, month, day), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function formatDateDisplay(value: string) {
  const { day, month, year } = parseDateParts(value);
  const date = new Date(year, month, day);
  return `${year}. ${month + 1}. ${day}.(${weekdayLabels[date.getDay()]})`;
}

export function formatSelectedDateTitle(value: string) {
  const { day, month, year } = parseDateParts(value);
  const date = new Date(year, month, day);
  return `${month + 1}. ${day}. ${weekdayLabels[date.getDay()]}`;
}

export function normalizeDate(value: string, fallback: string) {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : fallback;
}

export function normalizeEndDate(value: string, startDate: string) {
  const normalized = normalizeDate(value, startDate);
  const start = dateTime(startDate);
  const end = dateTime(normalized);
  return typeof start === 'number' && typeof end === 'number' && end >= start ? normalized : startDate;
}

export function normalizeTime(value: string) {
  const trimmed = value.trim();
  if (/^\d{1,2}$/.test(trimmed)) return `${trimmed.padStart(2, '0')}:00`;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '09:00';
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseTimeParts(value: string) {
  const normalized = normalizeTime(value);
  const [hour, minute] = normalized.split(':');
  const nearestMinute = minuteOptions.includes(minute)
    ? minute
    : minuteOptions.reduce((closest, option) => (
      Math.abs(Number(option) - Number(minute)) < Math.abs(Number(closest) - Number(minute)) ? option : closest
    ), minuteOptions[0]);
  return { hour, minute: nearestMinute };
}

export function stepTime(value: string, unit: 'hour' | 'minute', direction: 1 | -1) {
  const parts = parseTimeParts(value);
  if (unit === 'hour') {
    const hour = (Number(parts.hour) + direction + 24) % 24;
    return `${String(hour).padStart(2, '0')}:${parts.minute}`;
  }
  const currentIndex = minuteOptions.indexOf(parts.minute);
  const nextMinute = minuteOptions[(currentIndex + direction + minuteOptions.length) % minuteOptions.length];
  return `${parts.hour}:${nextMinute}`;
}

export function addMinutesToDateTime(date: string, timeValue: string, minutes: number) {
  const base = new Date(`${date}T${normalizeTime(timeValue)}:00`);
  base.setMinutes(base.getMinutes() + minutes);
  return {
    date: formatDate(base.getFullYear(), base.getMonth(), base.getDate()),
    time: `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`,
  };
}

export function compareDateTime(startDate: string, startTime: string, endDate: string, endTime: string) {
  const start = new Date(`${startDate}T${normalizeTime(startTime)}:00`).getTime();
  const end = new Date(`${endDate}T${normalizeTime(endTime)}:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return start - end;
}

function clampDay(year: number, month: number, day: number) {
  return Math.min(day, new Date(year, month + 1, 0).getDate());
}

export function stepDatePart(value: string, unit: 'year' | 'month' | 'day', direction: 1 | -1) {
  const parts = parseDateParts(value);
  if (unit === 'day') {
    const date = new Date(parts.year, parts.month, parts.day + direction);
    return formatDate(date.getFullYear(), date.getMonth(), date.getDate());
  }
  if (unit === 'month') {
    const date = new Date(parts.year, parts.month + direction, 1);
    date.setDate(clampDay(date.getFullYear(), date.getMonth(), parts.day));
    return formatDate(date.getFullYear(), date.getMonth(), date.getDate());
  }
  return formatDate(parts.year + direction, parts.month, clampDay(parts.year + direction, parts.month, parts.day));
}

export function isDateInEventRange(date: string, event: CalendarEvent) {
  const target = dateTime(date);
  const start = dateTime(event.date);
  const end = dateTime(event.endDate ?? event.date);
  if (typeof target !== 'number' || typeof start !== 'number' || typeof end !== 'number') return date === event.date;
  return target >= start && target <= end;
}

export function eventRangeLength(event: CalendarEvent) {
  const start = dateTime(event.date);
  const end = dateTime(event.endDate ?? event.date);
  if (typeof start !== 'number' || typeof end !== 'number') return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export function eventDateLabel(event: CalendarEvent) {
  const endDate = event.endDate && event.endDate !== event.date ? event.endDate : '';
  return endDate ? `${event.date}~${endDate}` : event.date;
}

export function eventTone(event: CalendarEvent) {
  if (event.activityType === 'outdoor') return '#279b64';
  if (event.activityType === 'transit') return '#2f80ed';
  return '#687180';
}

export function inferActivityType(title: string, memo = ''): CalendarEvent['activityType'] {
  const text = `${title} ${memo}`.replace(/\s+/g, '').toLowerCase();
  if (/이동|버스|지하철|기차|택시|운전|공항|여행|병원|통학|출근/.test(text)) return 'transit';
  if (/집|실내|카페|영화|도서관|학교|회사|마트|식당|회의/.test(text)) return 'indoor';
  return 'outdoor';
}
