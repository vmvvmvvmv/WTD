import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { calendarEventLocationKey } from '../../components/calendar/calendarLocation';
import type { CalendarLocationForecast } from '../../components/calendar/calendarForecast';
import { loadStoredAppState } from '../../storage/appStorage';
import { toIsoDate } from '../../utils/date';
import { toNumber } from '../../utils/format';
import { fetchDashboardDust, fetchDashboardWeather } from '../dashboard/dashboardService';
import { syncCalendarReminders } from './calendarReminderSchedule';
import { loadCalendarLocationForecast } from './useCalendarLocationForecasts';

// 앱이 꺼져 있어도 휴대폰(안드로이드 WorkManager, iOS BGTask)이 가끔 앱을 깨워 일정 알림 문구를 최신 예보로 다시 씁니다.
// 서버가 알림을 보내지 않으므로 서버가 멈춰도 알림은 그대로 울립니다. 실행 간격은 OS가 정하며(최소 약 15분) 절전 중엔 늦어질 수 있습니다.
export const CALENDAR_REMINDER_TASK = 'calendar-reminder-refresh';
const MINIMUM_INTERVAL_MINUTES = 30;

export async function refreshCalendarRemindersInBackground() {
  const state = await loadStoredAppState();
  const remindersEnabled = state.notificationSettings.enabled && state.notificationSettings.calendarReminders;
  const region = state.selectedRegion ?? state.gpsRegion;
  if (!remindersEnabled || !region) return;
  const today = toIsoDate(new Date());
  const upcoming = state.calendarEvents.filter((event) => (event.endDate ?? event.date) >= today && typeof event.notificationHoursBefore === 'number');
  if (upcoming.length === 0) return;

  const uniqueLocated = Array.from(new Map(
    upcoming.filter((event) => !!calendarEventLocationKey(event)).map((event) => [calendarEventLocationKey(event), event]),
  ).values());
  const [weatherResult, dustResult, ...locationResults] = await Promise.allSettled([
    fetchDashboardWeather(region, today, []),
    fetchDashboardDust(region, today, null),
    ...uniqueLocated.map((event) => loadCalendarLocationForecast(event, today)),
  ]);
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const dust = dustResult.status === 'fulfilled' ? dustResult.value : null;
  // 예보를 하나도 못 받았으면(오프라인 등) 지금 예약된 알림을 그대로 둡니다.
  if (!weather && !dust) return;
  const eventLocationForecasts: Record<string, CalendarLocationForecast> = {};
  locationResults.forEach((result) => {
    if (result.status === 'fulfilled' && result.value) eventLocationForecasts[result.value[0]] = result.value[1] as CalendarLocationForecast;
  });

  await syncCalendarReminders({
    events: state.calendarEvents,
    forecast: {
      currentPm10: toNumber(dust?.currentItem?.pm10Value),
      eventLocationForecasts,
      hourlyItems: dust?.hourlyItems,
      prediction: dust?.prediction,
      sensitiveMode: state.outfitSettings.sensitiveMode,
      todayDateLabel: today,
      weather: weather?.weather,
      weatherHourlyItems: weather?.hourlyItems,
      weatherMidTermItems: weather?.midTermItems,
    },
    remindersEnabled,
  });
}

// 앱 시작 파일(index.ts)에서 한 번 부릅니다. 작업 정의는 전역에 있어야 앱이 꺼진 상태에서도 찾을 수 있습니다.
export function defineCalendarReminderTask() {
  TaskManager.defineTask(CALENDAR_REMINDER_TASK, async () => {
    try {
      await refreshCalendarRemindersInBackground();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.warn('백그라운드에서 일정 알림을 갱신하지 못했습니다.', error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function setCalendarReminderBackgroundTask(enabled: boolean) {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  const isRegistered = await TaskManager.isTaskRegisteredAsync(CALENDAR_REMINDER_TASK);
  if (enabled && !isRegistered) await BackgroundTask.registerTaskAsync(CALENDAR_REMINDER_TASK, { minimumInterval: MINIMUM_INTERVAL_MINUTES });
  if (!enabled && isRegistered) await BackgroundTask.unregisterTaskAsync(CALENDAR_REMINDER_TASK);
}
