import { useState } from 'react';

import { saveCalendarTipSeen, saveTutorialSeen } from '../storage/appStorage';
import type { TabKey } from '../types/navigation';

// 튜토리얼: 첫 실행이면 환영 시트를 먼저 띄우고, "둘러보기"를 고른 사람만 홈 투어를 봅니다.
// 캘린더 말풍선은 캘린더를 처음 열 때만 보여 줍니다. 저장된 값은 앱 시작 때 hydrate로 채웁니다.
export function useAppTutorial({ notify, openCalendarEditor, switchTab }: {
  notify: (message: string) => void;
  openCalendarEditor: () => void;
  switchTab: (tab: TabKey) => void;
}) {
  const [tutorialMode, setTutorialMode] = useState<'none' | 'welcome' | 'tour'>('none');
  const [calendarTipSeen, setCalendarTipSeen] = useState(true);
  const hydrate = (stored: { calendarTipSeen: boolean; tutorialSeen: boolean }) => {
    setTutorialMode(stored.tutorialSeen ? 'none' : 'welcome');
    setCalendarTipSeen(stored.calendarTipSeen);
  };
  const finishTutorial = () => {
    void saveTutorialSeen();
    setTutorialMode('none');
  };
  const continueTutorialInCalendar = () => {
    finishTutorial();
    setCalendarTipSeen(false);
    switchTab('calendar');
  };
  const skipTutorialForNow = () => {
    finishTutorial();
    notify('설정 > 앱 정보에서 언제든 볼 수 있어요.');
  };
  const dismissCalendarTip = () => {
    void saveCalendarTipSeen();
    setCalendarTipSeen(true);
  };
  // "첫 일정 추가하기": 캘린더 일정 추가 화면을 바로 엽니다. 추가 버튼 말풍선은 겹치니 본 것으로 둡니다.
  const addFirstEvent = () => {
    finishTutorial();
    dismissCalendarTip();
    openCalendarEditor();
    switchTab('calendar');
  };
  return {
    addFirstEvent,
    calendarTipSeen,
    continueTutorialInCalendar,
    dismissCalendarTip,
    finishTutorial,
    hydrate,
    setTutorialMode,
    skipTutorialForNow,
    tutorialMode,
  };
}
