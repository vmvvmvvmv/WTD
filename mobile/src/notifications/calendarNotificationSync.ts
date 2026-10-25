import type { CalendarEvent } from '../types/calendar';

export type CalendarNotificationSyncActions = {
  cancel: (ids: string[]) => Promise<void>;
  isCurrent: () => boolean;
  save: (ids: string[]) => Promise<unknown>;
  schedule: (event: CalendarEvent) => Promise<string[]>;
};

export async function replaceCalendarNotifications(
  previousIds: string[],
  events: CalendarEvent[],
  actions: CalendarNotificationSyncActions,
) {
  const nextIds: string[] = [];
  try {
    for (const event of events) {
      if (!actions.isCurrent()) break;
      nextIds.push(...await actions.schedule(event));
    }
    if (actions.isCurrent()) {
      await actions.save(nextIds);
    } else {
      await actions.cancel(nextIds);
      return;
    }
  } catch (error) {
    await actions.cancel(nextIds);
    throw error;
  }
  await actions.cancel(previousIds);
}

// 앱 화면과 백그라운드 갱신이 동시에 예약을 바꾸면 서로 예약한 알림을 지우거나, 아무도 모르는 알림을 남긴다(두 번 울림).
// 그래서 한 번에 하나씩 돌린다. 앞 작업이 실패해도 다음 작업은 돈다.
let exclusiveQueue: Promise<unknown> = Promise.resolve();
export function runCalendarNotificationSyncExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = exclusiveQueue.then(task, task);
  exclusiveQueue = run.catch(() => undefined);
  return run;
}
