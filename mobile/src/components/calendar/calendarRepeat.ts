import type { CalendarEvent } from '../../types/calendar';
import { addMinutesToDateTime, formatDate, makeCalendarId, parseDateParts } from './calendarUtils';

export type CalendarRepeatMode = 'none' | 'yearly' | 'monthly' | 'weekly' | 'daily';

export type CalendarRepeatRule = {
  endDate: string;
  mode: CalendarRepeatMode;
  weekdays: number[];
};

// 생일·기념일처럼 오래 가는 반복을 위해 넉넉히 둔다. 종료일이 먼저 오면 거기서 멈춘다.
const MAX_YEARLY_OCCURRENCES = 30;
const MAX_MONTHLY_OCCURRENCES = 120;
const MAX_DAILY_OCCURRENCES = 370;
const MAX_WEEKLY_OCCURRENCES = 160;
const MAX_REPEAT_SCAN_DAYS = 3660;

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
      const date = formatDate(year, parts.month, clampDay(year, parts.month, parts.day));
      if (index > 0 && date > rule.endDate) break;
      events.push(createOccurrence(repeatBase, date));
    }
    return events;
  }

  if (rule.mode === 'monthly') {
    for (let index = 0; index < MAX_MONTHLY_OCCURRENCES; index += 1) {
      const monthDate = new Date(parts.year, parts.month + index, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const date = formatDate(year, month, clampDay(year, month, parts.day));
      if (index > 0 && date > rule.endDate) break;
      events.push(createOccurrence(repeatBase, date));
    }
    return events;
  }

  // 상한은 생성된 일정 수로 셉니다. 날짜 순회 상한은 요일이 비어 있을 때 종료일까지 헛도는 것만 막습니다.
  const limit = rule.mode === 'daily' ? MAX_DAILY_OCCURRENCES : MAX_WEEKLY_OCCURRENCES;
  let currentDate = base.date;
  for (let scanned = 0; events.length < limit && scanned < MAX_REPEAT_SCAN_DAYS && currentDate <= rule.endDate; scanned += 1) {
    const day = new Date(`${currentDate}T00:00:00`).getDay();
    if (rule.mode === 'daily' || rule.weekdays.includes(day)) events.push(createOccurrence(repeatBase, currentDate));
    currentDate = addDays(currentDate, 1);
  }
  return events.length > 0 ? events : [repeatBase];
}

// 반복 방식별 기본 종료일: 매년은 30번째 해, 매월은 120번째 달(상한과 같음), 매일·매주는 30일 뒤.
export function nextDefaultRepeatEndDate(startDate: string, mode: CalendarRepeatMode = 'daily') {
  const parts = parseDateParts(startDate);
  if (mode === 'yearly') {
    const year = parts.year + MAX_YEARLY_OCCURRENCES - 1;
    return formatDate(year, parts.month, clampDay(year, parts.month, parts.day));
  }
  if (mode === 'monthly') {
    const monthDate = new Date(parts.year, parts.month + MAX_MONTHLY_OCCURRENCES - 1, 1);
    return formatDate(monthDate.getFullYear(), monthDate.getMonth(), clampDay(monthDate.getFullYear(), monthDate.getMonth(), parts.day));
  }
  return addMinutesToDateTime(startDate, '00:00', 30 * 24 * 60).date;
}

// 반복 일정을 "이후 일정 모두" 삭제할 때: 같은 반복 묶음에서 이 날짜와 그 뒤의 일정을 뺀다(앞선 일정은 남긴다).
export function withoutFollowingOccurrences(events: CalendarEvent[], target: CalendarEvent) {
  if (!target.repeatGroupId) return events.filter((event) => event.id !== target.id);
  return events.filter((event) => event.repeatGroupId !== target.repeatGroupId || event.date < target.date);
}

// 저장해 두는 일정 수 상한. 매일 반복(최대 370개) 몇 개와 일반 일정이 들어갈 만큼 잡는다.
export const MAX_STORED_EVENTS = 1000;

const byStart = (a: CalendarEvent, b: CalendarEvent) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);

// 일정을 더할 때: 날짜순으로 정렬하고, 상한을 넘으면 가장 오래된 일정부터 지운다(새 일정·앞으로의 일정을 지키려고).
export function withAddedEvents(current: CalendarEvent[], added: CalendarEvent[]) {
  return [...added, ...current].sort(byStart).slice(-MAX_STORED_EVENTS);
}
