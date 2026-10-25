import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { CalendarForecastContext } from '../../components/calendar/calendarForecast';
import { canScheduleExactAlarms } from '../../notifications/exactAlarm';
import { configureDustNotifications } from '../../notifications/expoPush';
import type { CalendarEvent } from '../../types/calendar';
import { setCalendarReminderBackgroundTask } from './calendarReminderBackground';
import { syncCalendarReminders } from './calendarReminderSchedule';

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

  // '알람 및 리마인더'를 허용하고 돌아오면 이미 예약된 알림도 정확한 알람으로 다시 예약한다(아래 동기화가 다시 돈다).
  const [exactAlarmAllowed, setExactAlarmAllowed] = useState(canScheduleExactAlarms);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setExactAlarmAllowed(canScheduleExactAlarms());
    });
    return () => subscription.remove();
  }, []);

  // 앱이 꺼져 있어도 휴대폰이 가끔 앱을 깨워 일정 알림을 최신 예보로 다시 씁니다(일정 알림을 켠 동안만).
  useEffect(() => {
    if (!hasLoadedStore) return;
    void setCalendarReminderBackgroundTask(remindersEnabled).catch((error) => console.warn('백그라운드 갱신을 설정하지 못했습니다.', error));
  }, [hasLoadedStore, remindersEnabled]);

  useEffect(() => {
    if (!hasLoadedStore) return;
    let cancelled = false;
    const syncVersion = ++syncVersionRef.current;
    const isCurrent = () => !cancelled && syncVersionRef.current === syncVersion;

    const sync = async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (!isCurrent()) return;
      await syncCalendarReminders({
        events,
        forecast: { currentPm10, eventLocationForecasts, hourlyItems, prediction, sensitiveMode, todayDateLabel, weather, weatherHourlyItems, weatherMidTermItems },
        isCurrent,
        remindersEnabled,
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
    exactAlarmAllowed,
  ]);
}
