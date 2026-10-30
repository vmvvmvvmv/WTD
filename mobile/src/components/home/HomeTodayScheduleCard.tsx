import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';

import { styles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import type { buildHomeActivityGuideItems } from '../../features/dashboard/homeActivityGuidePresenter';
import { loadHomeTodayOpen, saveHomeTodayOpen } from '../../storage/appStorage';
import { AppActionIcon } from '../shared/AppActionIcon';
import { tutorialTarget } from '../shared/TutorialTour';

// 홈 배너 위 '오늘 일정' 접기 띠. 처음엔 얇은 띠(⌄)만 있고, 누르면 그 위에 한 줄이 열립니다.
// - 오늘 남은 일정 중 가장 가까운 것 하나와 그때 날씨(누르면 캘린더)
// - 남은 일정이 없으면 '오늘 일정이 없습니다 · 일정 추가'(누르면 오늘 날짜로 일정 추가)
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
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadHomeTodayOpen().then((value) => { if (!cancelled) setOpen(value); });
    return () => { cancelled = true; };
  }, []);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    saveHomeTodayOpen(next);
  };

  const upcoming = activityGuideRows.filter((item) => !item.isCompleted);
  const nearest = upcoming[0];

  return (
    <View ref={tutorialTarget('homeToday')}>
      {open && (nearest ? (
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
      ))}
      <Pressable
        accessibilityLabel={open ? '오늘 일정 접기' : '오늘 일정 펼치기'}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={{ bottom: 6, top: 6 }}
        onPress={toggle}
        style={({ pressed }) => [styles.homeTodayHandle, pressed && styles.pressedFeedback]}
      >
        {!open && <Text style={styles.homeTodayHandleText}>오늘 일정</Text>}
        <Ionicons color={accentTone} name={open ? 'chevron-up' : 'chevron-down'} size={16} />
      </Pressable>
    </View>
  );
}
