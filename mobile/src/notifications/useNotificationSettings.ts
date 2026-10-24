import { useEffect, useState } from 'react';

import { registerNotificationDevice } from '../api/dustEndpoints';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../constants/dust';
import { IS_EXPO_GO } from '../config/runtime';
import { requestDustPushToken } from './expoPush';
import { saveNotificationSettings, saveNotificationToken } from '../storage/appStorage';
import type { CalendarEvent } from '../types/calendar';
import type { RegionState } from '../types/region';
import type { NotificationSettings } from '../types/settings';

export function useNotificationSettings(
  hasLoadedStore: boolean,
  selectedRegion: RegionState | null,
  events: CalendarEvent[],
  todayDateLabel: string,
  notify: (message: string) => void,
) {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [serverPushToken, setServerPushToken] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const hydrate = (storedSettings: NotificationSettings, storedToken: string | null) => {
    setSettings(storedSettings);
    setServerPushToken(storedToken);
  };

  const updateSetting = (key: keyof NotificationSettings, value: boolean | number) => {
    if (key === 'enabled' && value && IS_EXPO_GO) {
      notify('Expo Go에서는 알림을 사용할 수 없어요. 개발 빌드에서 확인해 주세요.');
      return;
    }
    const nextSettings = { ...settings, [key]: value } as NotificationSettings;
    setIsSaving(true);
    notify('');
    setSettings(nextSettings);
    if (key === 'calendarReminders') {
      notify(value ? '일정 알림을 켰어요.' : '일정 알림을 껐어요.');
    } else if (key === 'weatherMorningAlerts') {
      notify(value ? '아침 날씨 알림을 켰어요.' : '아침 날씨 알림을 껐어요.');
    } else if (key === 'dustSpikeAlerts') {
      notify(value ? '미세먼지 나쁨 알림을 켰어요.' : '미세먼지 나쁨 알림을 껐어요.');
    } else {
      notify(value ? '알림을 켰어요.' : '알림을 껐어요.');
    }
    setIsSaving(false);
  };

  useEffect(() => {
    if (!hasLoadedStore || !selectedRegion || IS_EXPO_GO) return;
    let cancelled = false;
    const syncServerDevice = async () => {
      if (!settings.enabled) {
        if (!serverPushToken) return;
        await registerNotificationDevice({
          city: selectedRegion.city,
          dustSpikeAlerts: false,
          enabled: false,
          expoPushToken: serverPushToken,
          region: selectedRegion.region,
          weatherMorningAlerts: false,
        }).catch(() => {});
        return;
      }

      let token = serverPushToken;
      if (!token) {
        token = await requestDustPushToken().catch(() => null);
        if (!token || cancelled) return;
        setServerPushToken(token);
        await saveNotificationToken(token);
      }

      // 아침 알림은 날짜·시간만 서버로 보냅니다. 일정 제목은 보내지 않습니다.
      const calendarEventSummary = settings.weatherMorningAlerts
        ? events.filter((event) => event.date >= todayDateLabel).slice(0, 30)
          .map((event) => ({ date: event.date, time: event.time }))
        : [];
      await registerNotificationDevice({
        calendarEvents: calendarEventSummary,
        city: selectedRegion.city,
        dustSpikeAlerts: settings.dustSpikeAlerts,
        enabled: settings.enabled,
        expoPushToken: token,
        region: selectedRegion.region,
        weatherMorningAlerts: settings.weatherMorningAlerts,
      }).catch(() => {});
    };

    void syncServerDevice();
    return () => { cancelled = true; };
  }, [events, hasLoadedStore, selectedRegion, serverPushToken, settings.dustSpikeAlerts, settings.enabled, settings.weatherMorningAlerts, todayDateLabel]);

  useEffect(() => {
    if (hasLoadedStore) void saveNotificationSettings(settings);
  }, [hasLoadedStore, settings]);

  return { settings, hydrate, isSaving, updateSetting };
}
