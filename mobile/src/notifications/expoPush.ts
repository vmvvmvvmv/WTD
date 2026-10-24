import { Platform } from 'react-native';

import { EAS_PROJECT_ID, IS_EXPO_GO } from '../config/runtime';
import type { CalendarEvent } from '../types/calendar';

export type CalendarNotificationRisk = {
  pm10?: number;
  rainMm?: number;
  rainProbability?: number;
  rainTimeRange?: string;
  temperature?: number;
  temperatureMax?: number;
  temperatureMin?: number;
  weatherLabel?: string;
  windSpeed?: number;
  windTimeRange?: string;
};

export async function configureDustNotifications() {
  if (IS_EXPO_GO) return;

  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('dust-alerts', {
      name: 'WeatherToDo 날씨·일정 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

async function ensureNotificationPermission() {
  await configureDustNotifications();
  const Notifications = await import('expo-notifications');
  const currentPermission = await Notifications.getPermissionsAsync();
  const currentStatus = currentPermission as { granted?: boolean; status?: string };
  if (currentStatus.granted || currentStatus.status === 'granted') return true;
  const requestedPermission = await Notifications.requestPermissionsAsync();
  const requestedStatus = requestedPermission as { granted?: boolean; status?: string };
  return !!requestedStatus.granted || requestedStatus.status === 'granted';
}

export async function requestDustPushToken() {
  if (IS_EXPO_GO || !EAS_PROJECT_ID) return null;
  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) return null;
  const Notifications = await import('expo-notifications');
  const token = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
  return token.data;
}

export async function cancelCalendarEventNotifications(notificationIds: string[]) {
  if (IS_EXPO_GO) return;
  const Notifications = await import('expo-notifications');
  await Promise.all(notificationIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

function isThunderExpectedForNotification(risk?: CalendarNotificationRisk) {
  const label = risk?.weatherLabel ?? '';
  const lowerLabel = label.toLowerCase();
  return label.includes('\uCC9C\uB465')
    || label.includes('\uBC88\uAC1C')
    || label.includes('\uB099\uB8B0')
    || label.includes('\uB1CC\uC6B0')
    || lowerLabel.includes('thunder')
    || lowerLabel.includes('lightning')
    || lowerLabel.includes('storm');
}

function isHeatExpectedForNotification(risk?: CalendarNotificationRisk) {
  const temperature = risk?.temperatureMax ?? risk?.temperature;
  return typeof temperature === 'number' && temperature >= 30;
}

function isRainExpectedForNotification(risk?: CalendarNotificationRisk) {
  return (typeof risk?.rainProbability === 'number' && risk.rainProbability >= 60)
    || (typeof risk?.rainMm === 'number' && risk.rainMm > 0)
    || !!risk?.rainTimeRange
    || (risk?.weatherLabel ?? '').includes('\uBE44');
}

function isSnowExpectedForNotification(risk?: CalendarNotificationRisk) {
  const label = risk?.weatherLabel ?? '';
  return label.includes('\uB208') || label.toLowerCase().includes('snow');
}

function isColdExpectedForNotification(risk?: CalendarNotificationRisk) {
  const temperature = risk?.temperatureMin ?? risk?.temperature;
  return typeof temperature === 'number' && temperature <= 0;
}

function isWindyExpectedForNotification(risk?: CalendarNotificationRisk) {
  return typeof risk?.windSpeed === 'number' && risk.windSpeed >= 8;
}

function notificationRiskKinds(risk?: CalendarNotificationRisk) {
  const kinds: Array<'thunder' | 'coldSnow' | 'heat' | 'rain' | 'wind'> = [];
  // One notification leads with one risk. Keep the product priority stable across screens.
  if (isSnowExpectedForNotification(risk) || isColdExpectedForNotification(risk)) kinds.push('coldSnow');
  if (isThunderExpectedForNotification(risk)) kinds.push('thunder');
  if (isRainExpectedForNotification(risk)) kinds.push('rain');
  if (isWindyExpectedForNotification(risk)) kinds.push('wind');
  if (isHeatExpectedForNotification(risk)) kinds.push('heat');
  return kinds;
}

function rainProbabilityText(risk?: CalendarNotificationRisk) {
  return typeof risk?.rainProbability === 'number'
    ? `\uAC15\uC218 \uD655\uB960 ${Math.round(risk.rainProbability)}%`
    : '';
}

function rainForecastText(risk?: CalendarNotificationRisk) {
  const probability = rainProbabilityText(risk);
  const range = risk?.rainTimeRange ?? '';
  if (range && probability) return `${range} ${probability}예요`;
  if (range) return `${range} 비가 올 수 있어요`;
  if (probability) return `${probability}예요`;
  return '비가 올 수 있어요';
}

function notificationTemperatureText(risk?: CalendarNotificationRisk) {
  const min = risk?.temperatureMin ?? risk?.temperature;
  const max = risk?.temperatureMax ?? risk?.temperature;
  if (typeof min === 'number' && typeof max === 'number') {
    const roundedMin = Math.round(min);
    const roundedMax = Math.round(max);
    return roundedMin === roundedMax
      ? `\uC608\uC0C1 \uAE30\uC628 ${roundedMin}\u00B0C`
      : `\uC608\uC0C1 \uAE30\uC628 ${roundedMin}~${roundedMax}\u00B0C`;
  }
  const value = typeof min === 'number' ? min : max;
  return typeof value === 'number' ? `\uC608\uC0C1 \uAE30\uC628 ${Math.round(value)}\u00B0C` : '';
}

function withTemperature(body: string, risk?: CalendarNotificationRisk) {
  const temperatureText = notificationTemperatureText(risk);
  return temperatureText ? `${body}\n${temperatureText}` : body;
}

function leadNotificationBody(risk?: CalendarNotificationRisk) {
  const topRisk = notificationRiskKinds(risk)[0];
  if (topRisk === 'coldSnow') {
    const body = isSnowExpectedForNotification(risk)
      ? '눈 예보가 있어요. 따뜻한 겉옷과 미끄럽지 않은 신발을 챙기세요.'
      : '기온이 낮아요. 따뜻한 겉옷을 챙기세요.';
    return withTemperature(body, risk);
  }
  if (topRisk === 'thunder') return withTemperature('천둥·번개가 예상돼요. 야외 활동은 잠시 미루세요.', risk);
  if (topRisk === 'rain') return withTemperature(`${rainForecastText(risk)}. 우산을 챙기세요.`, risk);
  if (topRisk === 'wind') return withTemperature(`${risk?.windTimeRange ? `${risk.windTimeRange} ` : ''}바람이 강해요. 바람막이를 챙기세요.`, risk);
  if (topRisk === 'heat') return withTemperature('기온이 높아요. 물과 양산을 챙기고 한낮에는 쉬어 가세요.', risk);
  const pm10 = typeof risk?.pm10 === 'number' ? Math.round(risk.pm10) : null;
  const body = pm10 !== null && pm10 > 80
    ? `미세먼지 ${pm10}㎍/m³예요. 마스크를 챙기세요.`
    : '큰 날씨 변화는 없어요. 편하게 준비해도 괜찮아요.';
  return withTemperature(body, risk);
}

// 알림은 예약할 때 본 예보로 문구를 미리 써 둔다. 알림이 울릴 때까지 오래 남아 있으면 그사이 예보가 바뀔 수 있어서,
// 이보다 먼 알림은 날씨를 단정하지 않고 확인을 권한다. 앱을 열거나 백그라운드 갱신이 돌면 가까워진 알림을 최신 예보로 다시 쓴다.
const FRESH_FORECAST_WINDOW_MS = 12 * 60 * 60 * 1000;
const STALE_FORECAST_BODY = '출발 전에 최신 날씨를 한 번 확인해 보세요.';

function eventStartDate(event: CalendarEvent) {
  const date = new Date(`${event.date}T${event.time}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function notificationLeadDuration(hoursBefore: number) {
  const minutes = Math.round(hoursBefore * 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
}

async function scheduleLocalNotification({ body, date, event, title }: {
  body: string;
  date: Date;
  event: CalendarEvent;
  title: string;
}) {
  if (date.getTime() <= Date.now()) return null;
  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) throw new Error('일정 알림 권한이 없습니다.');
  const Notifications = await import('expo-notifications');
  return Notifications.scheduleNotificationAsync({
    content: {
      body,
      data: { calendarEventDate: event.date, calendarEventId: event.id, targetTab: 'calendar' },
      title,
    },
    trigger: {
      channelId: 'dust-alerts',
      date,
      type: Notifications.SchedulableTriggerInputTypes.DATE,
    },
  });
}

export async function scheduleCalendarEventNotifications(event: CalendarEvent, risk?: CalendarNotificationRisk) {
  if (IS_EXPO_GO) return [];

  const eventStart = eventStartDate(event);
  if (!eventStart) return [];
  const notificationIds: string[] = [];

  if (typeof event.notificationHoursBefore === 'number') {
    const requestedTriggerDate = new Date(eventStart.getTime() - event.notificationHoursBefore * 60 * 60 * 1000);
    const isLeadTimeAlreadyPast = requestedTriggerDate.getTime() <= Date.now() && eventStart.getTime() > Date.now();
    const triggerDate = isLeadTimeAlreadyPast ? eventStart : requestedTriggerDate;
    const isForecastStaleAtTrigger = triggerDate.getTime() - Date.now() > FRESH_FORECAST_WINDOW_MS;
    const notificationId = await scheduleLocalNotification({
      body: isForecastStaleAtTrigger ? STALE_FORECAST_BODY : leadNotificationBody(risk),
      date: triggerDate,
      event,
      title: isLeadTimeAlreadyPast
        ? `${event.title} 일정이 곧 시작돼요`
        : `${event.title} · ${notificationLeadDuration(event.notificationHoursBefore)} 전`,
    });
    if (notificationId) notificationIds.push(notificationId);
  }

  return notificationIds;
}





