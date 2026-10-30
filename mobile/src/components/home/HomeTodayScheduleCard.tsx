import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { styles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import type { buildHomeActivityGuideItems } from '../../features/dashboard/homeActivityGuidePresenter';
import { AppActionIcon } from '../shared/AppActionIcon';
import { tutorialTarget } from '../shared/TutorialTour';

// 홈 배너 아래 '산책하기 좋은 시간' 줄 바로 밑의 '오늘 일정' 한 줄: 다음에 할 일정과 그때 날씨를 보여 줘서,
// 일정에 맞춰 날씨를 보는 앱이라는 게 첫 화면에서 보이게 합니다. 남은 일정이 없으면 오늘 일정을 바로 추가합니다.
// 전체 목록은 아래 '일정 가이드' 탭에 있습니다.
export function HomeTodayScheduleCard({
  activityGuideRows,
  onAddToday,
  onOpenCalendar,
}: {
  activityGuideRows: ReturnType<typeof buildHomeActivityGuideItems>;
  onAddToday?: () => void;
  onOpenCalendar?: () => void;
}) {
  const upcoming = activityGuideRows.filter((item) => !item.isCompleted);
  const next = upcoming[0];
  const emptyLabel = activityGuideRows.length ? '오늘 남은 일정 없음' : '오늘 일정 없음';

  return (
    <Pressable
      accessibilityLabel={next
        ? `오늘 일정, ${next.timeLabel} ${next.title}. ${next.forecastLabel || next.advice}${upcoming.length > 1 ? `. 외 ${upcoming.length - 1}개` : ''}`
        : `${emptyLabel}. 오늘 일정 추가`}
      accessibilityRole="button"
      onPress={next ? onOpenCalendar : onAddToday}
      ref={tutorialTarget('homeToday')}
      style={({ pressed }) => [styles.homeBestOutingRow, pressed && styles.pressedFeedback]}
    >
      <AppActionIcon name="schedule" size={26} />
      {next ? (
        <Text numberOfLines={1} style={styles.homeBestOutingText}>
          오늘 일정 <Text style={styles.homeBestOutingTime}>{next.timeLabel.split('~')[0]}</Text> {next.title}
          <Text style={styles.homeBestOutingDetails}>
            {`  ${next.forecastLabel || next.advice}${upcoming.length > 1 ? ` · 외 ${upcoming.length - 1}개` : ''}`}
          </Text>
        </Text>
      ) : (
        <Text numberOfLines={1} style={styles.homeBestOutingText}>
          {emptyLabel}
          <Text style={styles.homeBestOutingDetails}>  일정을 적으면 그때 날씨를 알려 드려요</Text>
        </Text>
      )}
      {next ? (
        <Ionicons color={accentTone} name="chevron-forward" size={16} />
      ) : (
        <Text style={[styles.homeTodayAddText, { color: accentTone }]}>+ 추가</Text>
      )}
    </Pressable>
  );
}
