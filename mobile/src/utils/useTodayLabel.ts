import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { toIsoDate } from './date';

// 오늘 날짜(폰 시간 0시 기준, 'YYYY-MM-DD'). 앱을 켜 둔 채 자정을 넘기거나 다시 열어도 바로 바뀝니다.
export function useTodayLabel() {
  const [today, setToday] = useState(() => toIsoDate(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      setToday(toIsoDate(new Date()));
      clearTimeout(timer);
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime());
    };
    refresh();
    // 백그라운드에서는 타이머가 늦게 돌 수 있어, 앱으로 돌아올 때도 다시 봅니다.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return today;
}
