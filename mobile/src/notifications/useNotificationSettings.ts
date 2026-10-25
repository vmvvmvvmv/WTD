import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { registerNotificationDevice } from '../api/dustEndpoints';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../constants/dust';
import { IS_EXPO_GO } from '../config/runtime';
import { askExactAlarmIfNeeded } from './exactAlarm';
import { requestDustPushToken } from './expoPush';
import { saveNotificationSettings, saveNotificationToken } from '../storage/appStorage';
import type { CalendarEvent } from '../types/calendar';
import type { RegionState } from '../types/region';
import type { NotificationSettings } from '../types/settings';

// 서버 알림을 처음 켤 때, 서버에 저장하는 정보를 먼저 알린다. 동의하지 않으면 서버 알림만 끈다(일정 알림은 휴대폰 안에서 그대로 동작).
function confirmServerAlerts() {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      '서버 알림 안내',
      '아침 날씨·미세먼지·기상특보 알림을 보내려고 이 휴대폰의 알림 주소, 알림 지역, 일정 날짜·시간을 서버에 저장해요. 일정 제목은 보내지 않아요.',
      [
        { onPress: () => resolve(false), style: 'cancel', text: '끄기' },
        { onPress: () => resolve(true), text: '동의' },
      ],
      { cancelable: false },
    );
  });
}

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
  const serverNoticeOpenRef = useRef(false);
  // 설정을 빠르게 바꿔도 서버에 마지막 설정이 남도록 등록 요청을 하나씩 순서대로 보낸다.
  const registerQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const registerInOrder = (payload: Parameters<typeof registerNotificationDevice>[0]) => {
    registerQueueRef.current = registerQueueRef.current.then(() => registerNotificationDevice(payload).catch(() => {}));
    return registerQueueRef.current;
  };

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
      if (value) askExactAlarmIfNeeded();
    } else if (key === 'weatherMorningAlerts') {
      notify(value ? '아침 날씨 알림을 켰어요.' : '아침 날씨 알림을 껐어요.');
    } else if (key === 'dustSpikeAlerts') {
      notify(value ? '미세먼지 나쁨 알림을 켰어요.' : '미세먼지 나쁨 알림을 껐어요.');
    } else if (key === 'weatherWarningAlerts') {
      notify(value ? '기상특보 알림을 켰어요.' : '기상특보 알림을 껐어요.');
    } else {
      notify(value ? '알림을 켰어요.' : '알림을 껐어요.');
    }
    setIsSaving(false);
  };

  useEffect(() => {
    if (!hasLoadedStore || !selectedRegion || IS_EXPO_GO) return;
    const syncServerDevice = async () => {
      if (!settings.enabled) {
        if (!serverPushToken) return;
        await registerInOrder({
          city: selectedRegion.city,
          dustSpikeAlerts: false,
          enabled: false,
          expoPushToken: serverPushToken,
          region: selectedRegion.region,
          weatherMorningAlerts: false,
          weatherWarningAlerts: false,
        });
        return;
      }

      let token = serverPushToken;
      if (!token) {
        // 아직 서버에 등록한 적 없음: 서버 알림을 하나도 안 켰으면 등록하지 않고, 켰으면 먼저 안내하고 동의를 받는다.
        if (!settings.weatherMorningAlerts && !settings.dustSpikeAlerts && !settings.weatherWarningAlerts) return;
        if (serverNoticeOpenRef.current) return;
        serverNoticeOpenRef.current = true;
        const agreed = await confirmServerAlerts();
        serverNoticeOpenRef.current = false;
        if (!agreed) {
          setSettings((current) => ({ ...current, dustSpikeAlerts: false, weatherMorningAlerts: false, weatherWarningAlerts: false }));
          return;
        }
        // 안내창이 떠 있는 동안 설정이 바뀌어 이 실행이 낡았어도 토큰은 받아 둔다. 토큰이 생기면 최신 설정으로 다시 등록된다.
        token = await requestDustPushToken().catch(() => null);
        if (!token) return;
        setServerPushToken(token);
        await saveNotificationToken(token);
      }

      // 아침 알림은 날짜·시간만 서버로 보냅니다. 일정 제목은 보내지 않습니다.
      const calendarEventSummary = settings.weatherMorningAlerts
        ? events.filter((event) => event.date >= todayDateLabel).slice(0, 30)
          .map((event) => ({ date: event.date, time: event.time }))
        : [];
      await registerInOrder({
        calendarEvents: calendarEventSummary,
        city: selectedRegion.city,
        dustSpikeAlerts: settings.dustSpikeAlerts,
        // 서버 알림을 모두 끄면 서버 기기 정보도 비활성으로 둔다(30일 뒤 삭제 대상).
        enabled: settings.enabled && (settings.weatherMorningAlerts || settings.dustSpikeAlerts || settings.weatherWarningAlerts),
        expoPushToken: token,
        region: selectedRegion.region,
        weatherMorningAlerts: settings.weatherMorningAlerts,
        weatherWarningAlerts: settings.weatherWarningAlerts,
      });
    };

    void syncServerDevice();
  }, [events, hasLoadedStore, selectedRegion, serverPushToken, settings.dustSpikeAlerts, settings.enabled, settings.weatherMorningAlerts, settings.weatherWarningAlerts, todayDateLabel]);

  useEffect(() => {
    if (hasLoadedStore) void saveNotificationSettings(settings);
  }, [hasLoadedStore, settings]);

  return { settings, hydrate, isSaving, updateSetting };
}
