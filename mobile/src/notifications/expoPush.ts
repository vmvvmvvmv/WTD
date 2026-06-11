import { Platform } from 'react-native';

import { EAS_PROJECT_ID, IS_EXPO_GO } from '../config/runtime';
import type { CalendarEvent } from '../types/dust';

export type CalendarNotificationRisk = {
  pm10?: number;
  rainProbability?: number;
  rainTimeRange?: string;
  temperature?: number;
  weatherLabel?: string;
  windSpeed?: number;
};

function calendarNotificationId(event: CalendarEvent, kind: 'lead' | 'morning') {
  return `calendar:${event.id}:${kind}`;
}


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
      name: '誘몄꽭癒쇱? ?뚮┝',
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
  await Promise.all(notificationIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(scheduled
    .filter((notification) => notification.content.data?.calendarEventId)
    .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => {})));
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
  return typeof risk?.temperature === 'number' && risk.temperature >= 30;
}

function isRainExpectedForNotification(risk?: CalendarNotificationRisk) {
  return (typeof risk?.rainProbability === 'number' && risk.rainProbability >= 60)
    || (risk?.weatherLabel ?? '').includes('\uBE44');
}

function isSnowExpectedForNotification(risk?: CalendarNotificationRisk) {
  const label = risk?.weatherLabel ?? '';
  return label.includes('\uB208') || label.toLowerCase().includes('snow');
}

function isColdExpectedForNotification(risk?: CalendarNotificationRisk) {
  return typeof risk?.temperature === 'number' && risk.temperature <= 0;
}

function isWindyExpectedForNotification(risk?: CalendarNotificationRisk) {
  return typeof risk?.windSpeed === 'number' && risk.windSpeed >= 8;
}

function notificationRiskKinds(risk?: CalendarNotificationRisk) {
  const kinds: Array<'thunder' | 'coldSnow' | 'heat' | 'rain' | 'wind'> = [];
  if (isThunderExpectedForNotification(risk)) kinds.push('thunder');
  if (isSnowExpectedForNotification(risk) || isColdExpectedForNotification(risk)) kinds.push('coldSnow');
  if (isHeatExpectedForNotification(risk)) kinds.push('heat');
  if (isRainExpectedForNotification(risk)) kinds.push('rain');
  if (isWindyExpectedForNotification(risk)) kinds.push('wind');
  return kinds;
}

function rainProbabilityText(risk?: CalendarNotificationRisk) {
  return typeof risk?.rainProbability === 'number'
    ? `\uAC15\uC218 \uD655\uB960 ${Math.round(risk.rainProbability)}%`
    : '';
}

function shortRainTimeRange(risk?: CalendarNotificationRisk) {
  return risk?.rainTimeRange?.replace(/:00/g, '') ?? '';
}

function rainForecastText(risk?: CalendarNotificationRisk, compact = false) {
  const probability = rainProbabilityText(risk);
  const range = compact ? shortRainTimeRange(risk) : risk?.rainTimeRange ?? '';
  if (range && probability) return compact ? `${range}\uC2DC ${probability}` : `${range} \uC0AC\uC774 ${probability}`;
  if (range) return compact ? `${range}\uC2DC \uBE44 \uC608\uC0C1` : `${range} \uC0AC\uC774 \uBE44 \uC608\uC0C1`;
  return probability || '\uBE44 \uC608\uC0C1';
}

function leadNotificationBody(risk?: CalendarNotificationRisk) {
  const topRisk = notificationRiskKinds(risk)[0];
  if (topRisk === 'thunder') return '\uCC9C\uB465\u00B7\uBC88\uAC1C \uAC00\uB2A5\uC131\uC774 \uC788\uC5B4\uC694. \uC57C\uC678 \uD65C\uB3D9\uC740 \uD53C\uD558\uACE0 \uC548\uC804\uD55C \uC2E4\uB0B4\uB85C \uC774\uB3D9\uD558\uC138\uC694.';
  if (topRisk === 'coldSnow') return '\uC624\uB298 \uB9CE\uC774 \uCD94\uC6CC\uC694. \uB208\uC774 \uC62C \uC218\uB3C4 \uC788\uC73C\uB2C8 \uB530\uB73B\uD558\uAC8C \uC785\uACE0 \uB098\uAC00\uC138\uC694.';
  if (topRisk === 'heat') return '\uC624\uB298 \uB9CE\uC774 \uB354\uC6CC\uC694. \uBB3C\uC744 \uCC59\uAE30\uACE0 \uD55C\uB0AE \uC57C\uC678\uD65C\uB3D9\uC740 \uC904\uC774\uB294 \uAC8C \uC88B\uC544\uC694.';
  if (topRisk === 'rain') {
    return `\uBE44\uAC00 \uC62C \uC218 \uC788\uC5B4\uC694. ${rainForecastText(risk)}. \uC6B0\uC0B0 \uCC59\uAE30\uB294 \uAC70 \uC78A\uC9C0 \uB9C8\uC138\uC694.`;
  }
  if (topRisk === 'wind') return '\uBC14\uB78C\uC774 \uAF64 \uC138\uAC8C \uBD88\uC5B4\uC694. \uC57C\uC678\uC5D0\uC11C\uB294 \uC870\uC2EC\uD558\uC138\uC694.';
  const temperature = typeof risk?.temperature === 'number' ? `${Math.round(risk.temperature)}\u00B0C` : '-';
  const pm10 = typeof risk?.pm10 === 'number' ? Math.round(risk.pm10) : '-';
  return `\uB0A0\uC528\uAC00 \uAD1C\uCC2E\uC544\uC694. \uC77C\uC815 \uC804 \uAC00\uBCCD\uAC8C \uD655\uC778\uD574\uBCF4\uC138\uC694. (\uAE30\uC628 ${temperature} \u00B7 \uBBF8\uC138\uBA3C\uC9C0 ${pm10})`;
}

function morningNotificationBody(event: CalendarEvent, risk?: CalendarNotificationRisk) {
  const kinds = notificationRiskKinds(risk);
  const hasThunder = kinds.includes('thunder');
  const hasColdSnow = kinds.includes('coldSnow');
  const hasHeat = kinds.includes('heat');
  const hasRain = kinds.includes('rain');
  const hasWind = kinds.includes('wind');
  const prefix = `[${event.title}] `;
  if (hasThunder) return `${prefix}\uCC9C\uB465\u00B7\uBC88\uAC1C \uAC00\uB2A5\uC131\uC774 \uC788\uC5B4\uC694. \uC57C\uC678 \uC77C\uC815\uC740 \uC2E4\uB0B4 \uC77C\uC815\uC73C\uB85C \uC870\uC815\uD574\uBCF4\uC138\uC694.`;
  if (hasColdSnow && hasRain) return `${prefix}\uC77C\uC815 \uC788\uB294 \uB0A0\uC778\uB370 \uCD94\uC704\uC640 \uBE44\uAC00 \uC608\uBCF4\uB3FC \uC788\uC5B4\uC694. \uC6B0\uC0B0 \uCC59\uAE30\uACE0 \uB530\uB73B\uD558\uAC8C \uC785\uACE0 \uB098\uAC00\uC138\uC694.`;
  if (hasRain && hasWind) return `${prefix}\uC77C\uC815 \uC788\uB294 \uB0A0\uC778\uB370 \uBE44\uC5D0 \uBC14\uB78C\uAE4C\uC9C0 \uC608\uBCF4\uB3FC \uC788\uC5B4\uC694. \uC6B0\uC0B0 \uCC59\uAE30\uACE0 \uC678\uCD9C \uC2DC \uC870\uC2EC\uD558\uC138\uC694.`;
  if (hasColdSnow && hasWind) return `${prefix}\uC77C\uC815 \uC788\uB294 \uB0A0\uC778\uB370 \uCD94\uC704\uC640 \uBC14\uB78C\uC774 \uC608\uBCF4\uB3FC \uC788\uC5B4\uC694. \uB530\uB73B\uD558\uAC8C \uC785\uACE0 \uC57C\uC678\uC5D0\uC11C \uC870\uC2EC\uD558\uC138\uC694.`;
  if (hasColdSnow) return `${prefix}\uC624\uB298 \uAF64 \uCD94\uC6B8 \uAC83 \uAC19\uC544\uC694. \uB208 \uC18C\uC2DD\uB3C4 \uC788\uC73C\uB2C8 \uB530\uB73B\uD558\uAC8C \uC785\uACE0 \uB098\uAC00\uC138\uC694.`;
  if (hasHeat) return `${prefix}\uC624\uB298 \uB9CE\uC774 \uB354\uC6CC\uC694. \uBB3C\uC744 \uCC59\uAE30\uACE0 \uC624\uB798 \uAC77\uB294 \uC77C\uC815\uC740 \uC870\uC808\uD574\uBCF4\uC138\uC694.`;
  if (hasRain) {
    return `${prefix}\uC77C\uC815 \uC788\uB294 \uB0A0\uC778\uB370 ${rainForecastText(risk, true)}. \uB098\uAC00\uAE30 \uC804\uC5D0 \uC6B0\uC0B0 \uCC59\uAE30\uC138\uC694.`;
  }
  if (hasWind) return `${prefix}\uC624\uB298 \uBC14\uB78C\uC774 \uB9CE\uC774 \uBD88\uC5B4\uC694. \uC57C\uC678 \uC77C\uC815 \uC788\uC73C\uBA74 \uBBF8\uB9AC \uCC38\uACE0\uD558\uC138\uC694.`;
  return '';
}

function eventStartDate(event: CalendarEvent) {
  const date = new Date(`${event.date}T${event.time}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function scheduleLocalNotification({ body, date, event, identifier, title }: {
  body: string;
  date: Date;
  event: CalendarEvent;
  identifier: string;
  title: string;
}) {
  if (date.getTime() <= Date.now()) return null;
  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) return null;
  const Notifications = await import('expo-notifications');
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  return Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      body,
      data: { calendarEventId: event.id },
      title,
    },
    trigger: {
      channelId: 'dust-alerts',
      date,
      type: Notifications.SchedulableTriggerInputTypes.DATE,
    },
  });
}

export async function scheduleCalendarEventNotifications(event: CalendarEvent, risk?: CalendarNotificationRisk, todayDateLabel?: string) {
  if (IS_EXPO_GO) return [];

  const eventStart = eventStartDate(event);
  if (!eventStart) return [];
  const riskKinds = notificationRiskKinds(risk);
  const notificationIds: string[] = [];

  if (typeof event.notificationHoursBefore === 'number') {
    const triggerDate = new Date(eventStart);
    triggerDate.setHours(triggerDate.getHours() - event.notificationHoursBefore);
    const notificationId = await scheduleLocalNotification({
      body: leadNotificationBody(risk),
      date: triggerDate,
      event,
      identifier: calendarNotificationId(event, 'lead'),
      title: `\uC77C\uC815 ${event.notificationHoursBefore}\uC2DC\uAC04 \uC804: ${event.title}`,
    });
    if (notificationId) notificationIds.push(notificationId);
  }

  if (todayDateLabel && event.date === todayDateLabel && riskKinds.length > 0) {
    const morningDate = new Date(`${event.date}T08:00:00`);
    const morningId = await scheduleLocalNotification({
      body: morningNotificationBody(event, risk),
      date: morningDate,
      event,
      identifier: calendarNotificationId(event, 'morning'),
      title: `\uC624\uB298 \uC77C\uC815 \uB0A0\uC528 \uC900\uBE44: ${event.title}`,
    });
    if (morningId) notificationIds.push(morningId);
  }

  return notificationIds;
}

export async function scheduleCalendarEventNotification(event: CalendarEvent) {
  if (IS_EXPO_GO || typeof event.notificationHoursBefore !== 'number') return null;
  const triggerDate = new Date(`${event.date}T${event.time}:00`);
  if (Number.isNaN(triggerDate.getTime())) return null;
  triggerDate.setHours(triggerDate.getHours() - event.notificationHoursBefore);
  if (triggerDate.getTime() <= Date.now()) return null;

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) return null;

  const Notifications = await import('expo-notifications');
  return Notifications.scheduleNotificationAsync({
    content: {
      body: '\uACF5\uAE30\uC640 \uB0A0\uC528\uB97C \uD655\uC778\uD558\uACE0 \uC900\uBE44\uD574\uC8FC\uC138\uC694.',
      data: { calendarEventId: event.id },
      title: `\uC77C\uC815 ${event.notificationHoursBefore}\uC2DC\uAC04 \uC804: ${event.title}`,
    },
    trigger: {
      channelId: 'dust-alerts',
      date: triggerDate,
      type: Notifications.SchedulableTriggerInputTypes.DATE,
    },
  });
}





