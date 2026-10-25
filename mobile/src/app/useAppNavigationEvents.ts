import { useEffect, useRef } from 'react';
import { BackHandler, Keyboard, Linking } from 'react-native';

import type { TabKey } from '../types/navigation';

// 홈에서 뒤로가기를 두 번 누를 때 '한 번 더'로 볼 시간.
const EXIT_BACK_INTERVAL_MS = 2000;

// 앱 바깥에서 오는 탭 이동: 홈 화면 위젯 링크와 Android 뒤로가기의 마지막 단계.
export function useAppNavigationEvents(activeTab: TabKey, setActiveTab: (tab: TabKey) => void, notify: (message: string) => void) {
  // 홈 화면 위젯의 + 버튼(weathertodo://calendar)으로 열리면 캘린더 탭을 보여 줍니다.
  useEffect(() => {
    const openCalendar = (url: string | null) => {
      if (url?.startsWith('weathertodo://calendar')) setActiveTab('calendar');
    };
    void Linking.getInitialURL().then(openCalendar);
    const subscription = Linking.addEventListener('url', ({ url }) => openCalendar(url));
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 다른 탭이면 홈으로, 홈이면 한 번은 토스트로 알리고 2초 안에 한 번 더 누르면 나갑니다.
  // 한 번만 등록합니다. 뒤로가기 처리는 나중에 등록한 것부터 불리므로, 패널·시트·지도처럼 그때그때 등록되는 처리가 먼저 받습니다.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const lastHomeBackAtRef = useRef(0);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeTabRef.current !== 'home') {
        Keyboard.dismiss();
        setActiveTab('home');
        return true;
      }
      const now = Date.now();
      if (now - lastHomeBackAtRef.current < EXIT_BACK_INTERVAL_MS) return false;
      lastHomeBackAtRef.current = now;
      notify('한 번 더 누르면 앱이 종료돼요');
      return true;
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify]);
}
