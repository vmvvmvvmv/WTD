import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

const DAY_SHEET_HEIGHT = 300;

// 날짜 시트(아래에서 올라오는 그날 일정)의 열기·닫기·크게 보기 상태와 애니메이션.
// - progress: 날짜를 고르면 시트가 올라오고 닫으면 내려갑니다.
// - sizeProgress: 열린 시트를 크게/작게 바꿉니다.
export function useCalendarDaySheet(windowHeight: number) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const sizeProgress = useRef(new Animated.Value(0)).current;

  const compactHeight = Math.min(380, Math.max(DAY_SHEET_HEIGHT, Math.round(windowHeight * 0.42)));
  const expandedHeight = Math.max(compactHeight, windowHeight - 120);
  const animatedHeight = sizeProgress.interpolate({ inputRange: [0, 1], outputRange: [compactHeight, expandedHeight] });
  // 캘린더가 시트 높이만큼 위로 줄어들고, 시트는 그만큼 아래에서 올라옵니다.
  const calendarBottom = Animated.multiply(progress, animatedHeight);
  const translateY = Animated.multiply(Animated.subtract(1, progress), animatedHeight);

  const close = () => {
    setIsOpen(false);
    setIsExpanded(false);
    sizeProgress.setValue(0);
  };

  const setExpanded = (expanded: boolean) => {
    setIsExpanded(expanded);
    Animated.timing(sizeProgress, { duration: 220, toValue: expanded ? 1 : 0, useNativeDriver: false }).start();
  };

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      Animated.timing(progress, { duration: 220, toValue: 1, useNativeDriver: false }).start();
      return;
    }
    Animated.timing(progress, { duration: 180, toValue: 0, useNativeDriver: false }).start(({ finished }) => {
      if (!finished) return;
      setShouldRender(false);
      setIsExpanded(false);
      sizeProgress.setValue(0);
    });
  }, [isOpen, progress, sizeProgress]);

  return { animatedHeight, calendarBottom, close, isExpanded, isOpen, progress, setExpanded, setIsOpen, shouldRender, translateY };
}
