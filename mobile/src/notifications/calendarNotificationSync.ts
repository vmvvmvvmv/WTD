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
