import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import Reanimated, { Easing, FadeIn, FadeOut, ReduceMotion, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import type { buildHomeActivityGuideItems } from '../../features/dashboard/homeActivityGuidePresenter';
import { loadHomeTodayOpen, saveHomeTodayOpen } from '../../storage/appStorage';
import { AppActionIcon } from '../shared/AppActionIcon';
import { tutorialTarget } from '../shared/TutorialTour';

const LINE_HEIGHT = 44;
const PEEK_SHOW_MS = 5000;
const PEEK_HIDE_MS = 3000;
const EASING = Easing.out(Easing.cubic);

// 홈 배너 위 '오늘 일정' 접기 띠.
// - 접힘(기본): 얇은 띠에 오늘 일정이 배너처럼 하나씩 5초 보였다 사라집니다(없으면 '오늘 일정 없음').
// - 띠를 누르면 위로 한 줄이 미끄러지듯 열립니다: 가장 가까운 남은 일정과 그때 날씨(누르면 캘린더),
//   없으면 '오늘 일정이 없습니다 · 일정 추가'(누르면 오늘 날짜로 일정 추가).
// 열림·닫힘은 기억해서 다음에 앱을 열어도 그대로입니다.
export function HomeTodayScheduleCard({
  activityGuideRows,
  onAddToday,
  onOpenCalendar,
}: {
  activityGuideRows: ReturnType<typeof buildHomeActivityGuideItems>;
  onAddToday?: () => void;
  onOpenCalendar?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);
  useEffect(() => {
    let cancelled = false;
    loadHomeTodayOpen().then((value) => {
      if (cancelled) return;
      setOpen(value);
      progress.value = value ? 1 : 0; // 처음 불러올 때는 애니메이션 없이 제자리.
    });
    return () => { cancelled = true; };
  }, [progress]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    saveHomeTodayOpen(next);
    progress.value = reduceMotion ? (next ? 1 : 0) : withTiming(next ? 1 : 0, { duration: 240, easing: EASING });
  };
  const lineStyle = useAnimatedStyle(() => ({ height: progress.value * LINE_HEIGHT, opacity: progress.value }));
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }] }));

  const upcoming = activityGuideRows.filter((item) => !item.isCompleted);
  const nearest = upcoming[0];

  // 접힌 띠에 잠깐씩 보여 줄 문구: 남은 일정마다 "20:00 test · 맑음 · 16°", 없으면 '오늘 일정 없음'.
  const peekTexts = upcoming.length
    ? upcoming.map((item) => [item.timeLabel.split('~')[0], item.title, item.forecastLabel].filter(Boolean).join(' · '))
    : ['오늘 일정 없음'];
  const peekKey = peekTexts.join('|');
  const [peekIndex, setPeekIndex] = useState<number | null>(0);
  useEffect(() => {
    if (open) return;
    if (reduceMotion) {
      setPeekIndex(0);
      return;
    }
    // 5초 보이고 3초 쉬고, 다음 일정으로. 띠를 열면 멈춥니다.
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      setPeekIndex(index);
      timer = setTimeout(hide, PEEK_SHOW_MS);
    };
    const hide = () => {
      setPeekIndex(null);
      index = (index + 1) % peekTexts.length;
      timer = setTimeout(show, PEEK_HIDE_MS);
    };
    show();
    return () => clearTimeout(timer);
    // 문구 목록이 바뀔 때만 다시 시작합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, peekKey, reduceMotion]);
  const peekText = peekIndex === null ? null : peekTexts[peekIndex % peekTexts.length];

  return (
    <View ref={tutorialTarget('homeToday')}>
      <Reanimated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.homeTodayLineWrap, lineStyle]}>
        {nearest ? (
          <Pressable
            accessibilityLabel={`오늘 일정, ${nearest.timeLabel} ${nearest.title}. ${nearest.forecastLabel || nearest.advice}`}
            accessibilityRole="button"
            onPress={onOpenCalendar}
            style={({ pressed }) => [styles.homeTodayLine, pressed && styles.pressedFeedback]}
          >
            <AppActionIcon name="schedule" size={24} />
            <Text numberOfLines={1} style={styles.homeTodayLineText}>
              오늘 <Text style={styles.homeBestOutingTime}>{nearest.timeLabel.split('~')[0]}</Text> {nearest.title}
              <Text style={styles.homeBestOutingDetails}>{`  ${nearest.forecastLabel || nearest.advice}`}</Text>
            </Text>
            <Ionicons color={accentTone} name="chevron-forward" size={16} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="오늘 일정이 없습니다. 일정 추가"
            accessibilityRole="button"
            onPress={onAddToday}
            style={({ pressed }) => [styles.homeTodayLine, pressed && styles.pressedFeedback]}
          >
            <AppActionIcon name="schedule" size={24} />
            <Text numberOfLines={1} style={styles.homeTodayLineText}>오늘 일정이 없습니다</Text>
            <Text style={[styles.homeTodayAddText, { color: accentTone }]}>+ 일정 추가</Text>
          </Pressable>
        )}
      </Reanimated.View>
      <Pressable
        accessibilityLabel={open ? '오늘 일정 접기' : `오늘 일정 펼치기. ${peekTexts.join(', ')}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={{ bottom: 6, top: 6 }}
        onPress={toggle}
        style={({ pressed }) => [styles.homeTodayHandle, pressed && styles.pressedFeedback]}
      >
        {!open && !!peekText && (
          <Reanimated.Text
            entering={FadeIn.duration(300).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(300).reduceMotion(ReduceMotion.System)}
            key={`${peekIndex}-${peekText}`}
            numberOfLines={1}
            style={styles.homeTodayHandleText}
          >
            {peekText}
          </Reanimated.Text>
        )}
        <Reanimated.View style={chevronStyle}>
          <Ionicons color={accentTone} name="chevron-down" size={16} />
        </Reanimated.View>
      </Pressable>
    </View>
  );
}
