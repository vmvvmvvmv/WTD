import type { CalendarEvent } from '../../types/dust';

const DEFAULT_DURATION_MINUTES = 60;

export type TimelineBlock = { endMinute: number; event: CalendarEvent; lane: number; lanes: number; startMinute: number };

function minutesOf(time: string | undefined) {
  const match = (time ?? '').match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

// 여러 날에 걸친 일정은 시간표 위쪽 막대로, 하루 안 일정만 시간표 블록으로 그립니다.
export function isMultiDayEvent(event: CalendarEvent) {
  return !!event.endDate && event.endDate !== event.date;
}

// 그날 하루 안 일정을 시간표 블록으로. 겹치는 일정끼리는 칸을 나눠 나란히 둡니다.
export function buildTimelineBlocks(date: string, events: CalendarEvent[]): TimelineBlock[] {
  const blocks = events
    .filter((event) => event.date === date && !isMultiDayEvent(event))
    .map((event) => {
      const startMinute = minutesOf(event.time) ?? 9 * 60;
      const end = minutesOf(event.endTime);
      const endMinute = end !== undefined && end > startMinute ? end : Math.min(24 * 60, startMinute + DEFAULT_DURATION_MINUTES);
      return { endMinute, event, lane: 0, lanes: 1, startMinute };
    })
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);

  // ponytail: 겹치는 묶음 전체를 같은 칸 수로 나눔(구글·삼성처럼 빈 칸을 넓혀 쓰진 않음).
  let group: TimelineBlock[] = [];
  let groupEnd = -1;
  const closeGroup = () => {
    const lanes = Math.max(1, ...group.map((block) => block.lane + 1));
    group.forEach((block) => { block.lanes = lanes; });
    group = [];
  };
  blocks.forEach((block) => {
    if (group.length && block.startMinute >= groupEnd) closeGroup();
    const laneEnds: number[] = [];
    group.forEach((other) => { laneEnds[other.lane] = Math.max(laneEnds[other.lane] ?? 0, other.endMinute); });
    let lane = 0;
    while (laneEnds[lane] !== undefined && laneEnds[lane] > block.startMinute) lane += 1;
    block.lane = lane;
    group.push(block);
    groupEnd = Math.max(groupEnd, block.endMinute);
  });
  if (group.length) closeGroup();
  return blocks;
}

