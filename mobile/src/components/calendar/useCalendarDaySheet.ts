import { useEffect, useState } from 'react';
import { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DAY_SHEET_HEIGHT = 300;
const EASING = Easing.out(Easing.cubic);

// 날짜 시트(아래에서 올라오는 그날 일정)의 열기·닫기·크게 보기 상태와 애니메이션.
// - progress: 날짜를 고르면 시트가 올라오고 닫으면 내려갑니다.
// - sizeProgress: 열린 시트를 크게/작게 바꿉니다.
// 캘린더 높이와 시트 높이가 매 프레임 바뀌므로 Reanimated로 화면 스레드에서 돌려, JS가 바쁠 때도 끊기지 않게 합니다.
export function useCalendarDaySheet(panelHeight: number) {
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const progress = useSharedValue(0);
  const sizeProgress = useSharedValue(0);

  const compactHeight = Math.min(380, Math.max(DAY_SHEET_HEIGHT, Math.round(panelHeight * 0.42)), Math.max(0, panelHeight - 64));
  const expandedHeight = Math.max(compactHeight, panelHeight - 48);

  const close = () => {
    setIsOpen(false);
    setIsExpanded(false);
    sizeProgress.value = 0;
  };

  const setExpanded = (expanded: boolean) => {
    setIsExpanded(expanded);
    sizeProgress.value = reduceMotion ? (expanded ? 1 : 0) : withTiming(expanded ? 1 : 0, { duration: 220, easing: EASING });
  };

  const finishClose = () => {
    setShouldRender(false);
    setIsExpanded(false);
    sizeProgress.value = 0;
  };

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      progress.value = reduceMotion ? 1 : withTiming(1, { duration: 220, easing: EASING });
      return;
    }
    if (reduceMotion) {
      progress.value = 0;
      finishClose();
      return;
    }
    progress.value = withTiming(0, { duration: 180, easing: EASING }, (finished) => {
      if (finished) scheduleOnRN(finishClose);
    });
    // finishClose는 setState만 부르므로 의존성에서 뺍니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, progress, reduceMotion]);

  // 캘린더가 시트 높이만큼 위로 줄어들고, 시트는 그만큼 아래에서 올라옵니다.
  const stageStyle = useAnimatedStyle(() => {
    const height = compactHeight + (expandedHeight - compactHeight) * sizeProgress.value;
    return { bottom: progress.value * height };
  });
  const sheetStyle = useAnimatedStyle(() => {
    const height = compactHeight + (expandedHeight - compactHeight) * sizeProgress.value;
    return { height, maxHeight: height, transform: [{ translateY: (1 - progress.value) * height }] };
  });
  return { close, isExpanded, isOpen, setExpanded, setIsOpen, sheetStyle, shouldRender, stageStyle };
}
