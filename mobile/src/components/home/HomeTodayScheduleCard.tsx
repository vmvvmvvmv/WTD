import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import Reanimated, { Easing, FadeIn, FadeOut, ReduceMotion, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import { accentSoftTone, accentTone } from '../../theme/appTheme';
import type { buildHomeActivityGuideItems } from '../../features/dashboard/homeActivityGuidePresenter';
import { loadHomeTodayOpen, saveHomeTodayOpen } from '../../storage/appStorage';
import { AppActionIcon } from '../shared/AppActionIcon';
import { tutorialTarget } from '../shared/TutorialTour';

const LINE_HEIGHT = 44;
const ROTATE_MS = 5000;
const EASING = Easing.out(Easing.cubic);
const fadeIn = FadeIn.duration(300).reduceMotion(ReduceMotion.System);
const fadeOut = FadeOut.duration(300).reduceMotion(ReduceMotion.System);

// 5초마다 다음 순서로 넘기는 번호. withGap이면 보이는 5초 뒤에 비는 5초(null)를 끼웁니다.
// active가 아니거나 '애니메이션 줄이기'면 첫 번째에 멈춥니다.
function useRotation(count: number, active: boolean, withGap: boolean, resetKey: string) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState<number | null>(0);
  useEffect(() => {
    setIndex(0);
    if (!active || reduceMotion || (count < 2 && !withGap)) return;
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      if (withGap) setIndex(step % 2 === 1 ? null : (step / 2) % count);
      else setIndex(step % count);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [active, count, reduceMotion, resetKey, withGap]);
  return index;
}

// 홈 배너 위 '오늘 일정' 접기 띠.
// - 접힘(기본): 얇은 띠에 남은 일정이 하나씩 5초 보이고 5초 쉬며 번갈아 나옵니다(없으면 '오늘 일정 없음').
// - 손잡이를 누르면 위로 한 줄이 미끄러지듯 열립니다: 남은 일정을 가까운 순서대로 5초마다 넘기며 그때 날씨와 함께(누르면 캘린더),
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
  const handleIconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }] }));

  const upcoming = activityGuideRows.filter((item) => !item.isCompleted);
  const upcomingKey = upcoming.map((item) => item.id).join('|');
  const lineIndex = useRotation(upcoming.length, open, false, upcomingKey) ?? 0;
  const shown = upcoming[lineIndex % Math.max(1, upcoming.length)];

  // 접힌 띠에 잠깐씩 보여 줄 문구: 남은 일정마다 "20:00 · test · 맑음 · 16°", 없으면 '오늘 일정 없음'.
  const peekTexts = upcoming.length
    ? upcoming.map((item) => [item.timeLabel.split('~')[0], item.title, item.forecastLabel].filter(Boolean).join(' · '))
    : ['오늘 일정 없음'];
  const peekIndex = useRotation(peekTexts.length, !open, true, peekTexts.join('|'));
  const peekText = peekIndex === null ? null : peekTexts[peekIndex % peekTexts.length];

  return (
    <View ref={tutorialTarget('homeToday')}>
      <Reanimated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.homeTodayLineWrap, lineStyle]}>
        {shown ? (
          <Pressable
            accessibilityLabel={`오늘 일정 ${upcoming.length}개. ${upcoming.map((item) => `${item.timeLabel} ${item.title}`).join(', ')}`}
            accessibilityRole="button"
            onPress={onOpenCalendar}
            style={({ pressed }) => [styles.homeTodayLine, pressed && styles.pressedFeedback]}
          >
            <AppActionIcon name="schedule" size={24} />
            <Reanimated.Text entering={fadeIn} exiting={fadeOut} key={shown.id} numberOfLines={1} style={styles.homeTodayLineText}>
              {lineIndex === 0 ? '오늘 ' : '다음 '}
              <Text style={styles.homeBestOutingTime}>{shown.timeLabel.split('~')[0]}</Text> {shown.title}
              <Text style={styles.homeBestOutingDetails}>{`  ${shown.forecastLabel || shown.advice}`}</Text>
            </Reanimated.Text>
            {upcoming.length > 1 && <Text style={styles.homeTodayCounter}>{`${lineIndex + 1}/${upcoming.length}`}</Text>}
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
          <Reanimated.Text entering={fadeIn} exiting={fadeOut} key={`${peekIndex}-${peekText}`} numberOfLines={1} style={styles.homeTodayHandleText}>
            {peekText}
          </Reanimated.Text>
        )}
        {/* 손잡이: 연한 알약 안의 작은 화살표. 열리면 위를 향해 돕니다. */}
        <View style={[styles.homeTodayGrip, { backgroundColor: accentSoftTone }]}>
          <Reanimated.View style={handleIconStyle}>
            <Ionicons color={accentTone} name="chevron-down" size={13} />
          </Reanimated.View>
        </View>
      </Pressable>
    </View>
  );
}
