import { useEffect, useRef } from 'react';

import { buildCalendarRiskByEvent } from '../../components/calendar/calendarForecast';
import type { CalendarForecastContext } from '../../components/calendar/calendarForecast';
import { cancelCalendarEventNotifications, configureDustNotifications, scheduleCalendarEventNotifications } from '../../notifications/expoPush';
import { replaceCalendarNotifications } from '../../notifications/calendarNotificationSync';
import { loadCalendarNotificationIds, saveCalendarNotificationIds } from '../../storage/appStorage';
import type { CalendarEvent } from '../../types/calendar';

const MAX_SCHEDULED_EVENTS = 60;

export function useCalendarReminderSync(
  events: CalendarEvent[],
  hasLoadedStore: boolean,
  remindersEnabled: boolean,
  forecast: CalendarForecastContext,
) {
  const syncVersionRef = useRef(0);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const {
    currentPm10, eventLocationForecasts, hourlyItems, prediction, sensitiveMode,
    todayDateLabel, weather, weatherHourlyItems, weatherMidTermItems,
  } = forecast;

  useEffect(() => {
    void configureDustNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasLoadedStore) return;
    let cancelled = false;
    const syncVersion = ++syncVersionRef.current;

    const sync = async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (cancelled || syncVersionRef.current !== syncVersion) return;
      const previousIds = await loadCalendarNotificationIds();
      if (cancelled || syncVersionRef.current !== syncVersion) return;

      // OS가 앱마다 예약 알림 수를 제한한다(iOS 64개). 가까운 일정만 예약하고, 앱을 열 때마다 다시 채운다.
      const eventsToSchedule = remindersEnabled ? events.filter((event) => event.date >= todayDateLabel && typeof event.notificationHoursBefore === 'number').slice(0, MAX_SCHEDULED_EVENTS) : [];
      const riskByEvent = remindersEnabled ? buildCalendarRiskByEvent(eventsToSchedule, {
        currentPm10, eventLocationForecasts, hourlyItems, prediction, sensitiveMode,
        todayDateLabel, weather, weatherHourlyItems, weatherMidTermItems,
      }) : null;
      await replaceCalendarNotifications(previousIds, eventsToSchedule, {
        cancel: cancelCalendarEventNotifications,
        isCurrent: () => !cancelled && syncVersionRef.current === syncVersion,
        save: saveCalendarNotificationIds,
        schedule: (event) => scheduleCalendarEventNotifications(event, riskByEvent?.[event.id]),
      });
    };

    syncQueueRef.current = syncQueueRef.current
      .then(sync)
      .catch((error) => console.warn('일정 알림을 다시 예약하지 못했습니다.', error));
    return () => { cancelled = true; };
  }, [
    events,
    currentPm10,
    eventLocationForecasts,
    hourlyItems,
    prediction,
    sensitiveMode,
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
    hasLoadedStore,
    remindersEnabled,
  ]);
}
