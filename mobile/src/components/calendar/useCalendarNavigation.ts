import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { addDays, formatDate, parseDateParts, startOfWeek } from './calendarUtils';

export type CalendarViewMode = 'list' | 'day' | 'week' | 'month' | 'year';
export const VIEW_MODES: { key: CalendarViewMode; label: string }[] = [
  { key: 'list', label: '목록' },
  { key: 'day', label: '일' },
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
  { key: 'year', label: '년' },
];

// 지금 어떤 보기(목록·일·주·월·년)로 어느 기간을 보고 있는지, 그리고 기간 이동·오늘로·보기 바꾸기.
// onPeriodChange: 기간이나 보기가 바뀔 때(날짜 시트 닫기 등).
export function useCalendarNavigation(todayDateLabel: string, onPeriodChange: () => void) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [selectedDate, setSelectedDate] = useState(todayDateLabel);
  const [transitionDirection, setTransitionDirection] = useState(1);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const parts = parseDateParts(todayDateLabel);
    return { month: parts.month, year: parts.year };
  });

  // 켜 둔 채 날짜가 바뀌면, 어제(=예전 오늘)를 보고 있던 경우에만 새 오늘로 옮깁니다.
  const previousTodayRef = useRef(todayDateLabel);
  useEffect(() => {
    const previousToday = previousTodayRef.current;
    previousTodayRef.current = todayDateLabel;
    if (previousToday === todayDateLabel) return;
    const next = parseDateParts(todayDateLabel);
    const previous = parseDateParts(previousToday);
    setSelectedDate((current) => (current === previousToday ? todayDateLabel : current));
    setVisibleMonth((current) => (current.year === previous.year && current.month === previous.month ? { month: next.month, year: next.year } : current));
  }, [todayDateLabel]);

  // 일·주 보기는 고른 날짜(가 들어 있는 주)를 보여줍니다.
  const weekStart = startOfWeek(selectedDate);
  const isTimeline = viewMode === 'week' || viewMode === 'day';

  // 화살표·스와이프 한 칸: 일 보기는 하루, 주 보기는 7일, 월 보기는 한 달, 년 보기는 1년.
  const movePeriod = (offset: number) => {
    setTransitionDirection(offset >= 0 ? 1 : -1);
    if (isTimeline) {
      const nextDate = addDays(selectedDate, offset * (viewMode === 'week' ? 7 : 1));
      const parts = parseDateParts(nextDate);
      setSelectedDate(nextDate);
      setVisibleMonth({ month: parts.month, year: parts.year });
    } else {
      const next = new Date(visibleMonth.year, visibleMonth.month + offset * (viewMode === 'year' ? 12 : 1), 1);
      setVisibleMonth({ month: next.getMonth(), year: next.getFullYear() });
    }
    onPeriodChange();
  };

  // 다른 기간을 보다가 "오늘"을 누르면 오늘이 있는 기간으로 (방향에 맞게) 넘어가고 오늘을 고릅니다.
  const [todayYear, todayMonth] = todayDateLabel.split('-').map(Number);
  const isViewingTodayMonth = visibleMonth.year === todayYear && visibleMonth.month === todayMonth - 1;
  const isViewingToday = viewMode === 'day' ? selectedDate === todayDateLabel
    : viewMode === 'week' ? weekStart === startOfWeek(todayDateLabel)
      : viewMode === 'year' ? visibleMonth.year === todayYear : isViewingTodayMonth;
  const goToday = () => {
    const isForward = isTimeline
      ? todayDateLabel >= selectedDate
      : todayYear * 12 + todayMonth - 1 >= visibleMonth.year * 12 + visibleMonth.month;
    setTransitionDirection(isForward ? 1 : -1);
    setVisibleMonth({ month: todayMonth - 1, year: todayYear });
    setSelectedDate(todayDateLabel);
    onPeriodChange();
  };

  const changeViewMode = (mode: CalendarViewMode) => {
    if (mode === viewMode) return;
    const nextIsTimeline = mode === 'week' || mode === 'day';
    if (nextIsTimeline && !isTimeline && !selectedDate.startsWith(formatDate(visibleMonth.year, visibleMonth.month, 1).slice(0, 8))) {
      // 보던 달 밖의 날짜가 골라져 있으면, 보던 달(이번 달이면 오늘)의 주로 엽니다.
      setSelectedDate(isViewingTodayMonth ? todayDateLabel : formatDate(visibleMonth.year, visibleMonth.month, 1));
    }
    if (mode === 'month' && isTimeline) {
      const parts = parseDateParts(selectedDate);
      setVisibleMonth({ month: parts.month, year: parts.year });
    }
    onPeriodChange();
    setViewMode(mode);
  };

  const selectYearMonth = (month: number) => {
    setVisibleMonth({ month, year: visibleMonth.year });
    setViewMode('month');
  };

  return {
    changeViewMode,
    goToday: isViewingToday ? undefined : goToday,
    movePeriod,
    selectedDate,
    selectYearMonth,
    setSelectedDate,
    transitionDirection,
    viewAnimatedStyle: useViewZoom(viewMode),
    viewMode,
    visibleMonth,
    weekStart,
  };
}

// 보기를 바꿀 때: 더 큰 단위(일→주→월→년)로 가면 살짝 줄어들며, 작은 단위로 가면 살짝 커지며 나타납니다(줌 느낌).
function useViewZoom(viewMode: CalendarViewMode) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const previousViewModeRef = useRef(viewMode);
  const [zoomFrom, setZoomFrom] = useState(1);
  useLayoutEffect(() => {
    const order = VIEW_MODES.map((mode) => mode.key);
    const previous = previousViewModeRef.current;
    previousViewModeRef.current = viewMode;
    if (previous === viewMode || reduceMotion) return;
    setZoomFrom(order.indexOf(viewMode) > order.indexOf(previous) ? 1.05 : 0.95);
    progress.setValue(0);
    Animated.timing(progress, { duration: 240, toValue: 1, useNativeDriver: true }).start();
  }, [progress, reduceMotion, viewMode]);
  return {
    opacity: progress,
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [zoomFrom, 1] }) }],
  };
}
