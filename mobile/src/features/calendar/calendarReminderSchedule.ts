import { buildCalendarRiskByEvent } from '../../components/calendar/calendarForecast';
import type { CalendarForecastContext } from '../../components/calendar/calendarForecast';
import { cancelCalendarEventNotifications, scheduleCalendarEventNotifications } from '../../notifications/expoPush';
import { replaceCalendarNotifications } from '../../notifications/calendarNotificationSync';
import { loadCalendarNotificationIds, saveCalendarNotificationIds } from '../../storage/appStorage';
import type { CalendarEvent } from '../../types/calendar';

const MAX_SCHEDULED_EVENTS = 60;

// 일정 알림을 지금 예보로 다시 예약합니다. 앱이 열려 있을 때(아래 훅)와 백그라운드 갱신 때 함께 씁니다.
export async function syncCalendarReminders({ events, forecast, isCurrent = () => true, remindersEnabled }: {
  events: CalendarEvent[];
  forecast: CalendarForecastContext;
  isCurrent?: () => boolean;
  remindersEnabled: boolean;
}) {
  const previousIds = await loadCalendarNotificationIds();
  if (!isCurrent()) return;
  // OS가 앱마다 예약 알림 수를 제한한다(iOS 64개). 가까운 일정만 예약하고, 앱을 열 때마다 다시 채운다.
  const eventsToSchedule = remindersEnabled
    ? events.filter((event) => event.date >= forecast.todayDateLabel && typeof event.notificationHoursBefore === 'number').slice(0, MAX_SCHEDULED_EVENTS)
    : [];
  const riskByEvent = remindersEnabled ? buildCalendarRiskByEvent(eventsToSchedule, forecast) : null;
  await replaceCalendarNotifications(previousIds, eventsToSchedule, {
    cancel: cancelCalendarEventNotifications,
    isCurrent,
    save: saveCalendarNotificationIds,
    schedule: (event) => scheduleCalendarEventNotifications(event, riskByEvent?.[event.id]),
  });
}
