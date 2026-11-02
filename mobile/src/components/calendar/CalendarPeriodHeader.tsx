import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import { bauhausColors } from '../../theme/bauhaus';

// 일·주·월·년 보기 공통 머리: ‹ 제목 [오늘] ›
export function CalendarPeriodHeader({ onGoToday, onLongPressTitle, onMove, title, unitLabel }: {
  // 오늘이 들어 있는 기간이 아닐 때만 넘깁니다.
  onGoToday?: () => void;
  // 제목(예: 2026년 11월)을 길게 누르면 년 보기로 올라갑니다.
  onLongPressTitle?: () => void;
  onMove: (offset: number) => void;
  title: string;
  unitLabel: string;
}) {
  return (
    <View style={styles.calendarMonthHeader}>
      <Pressable accessibilityLabel={`이전 ${unitLabel}`} onPress={() => onMove(-1)} style={({ pressed }) => [styles.calendarMonthButton, pressed && styles.pressedFeedback]}>
        <Ionicons color={bauhausColors.blue} name="chevron-back" size={22} />
      </Pressable>
      <View style={styles.calendarMonthTitleGroup}>
        <Pressable
          accessibilityHint={onLongPressTitle ? '길게 누르면 년 단위로 봐요' : undefined}
          delayLongPress={350}
          disabled={!onLongPressTitle}
          onLongPress={onLongPressTitle}
          style={({ pressed }) => pressed && styles.pressedFeedback}
        >
          <Text style={styles.calendarMonthTitle}>{title}</Text>
        </Pressable>
        {onGoToday && (
          <Pressable accessibilityLabel="오늘로 이동" accessibilityRole="button" hitSlop={8} onPress={onGoToday} style={({ pressed }) => [styles.calendarTodayButton, pressed && styles.pressedFeedback]}>
            <Text style={styles.calendarTodayButtonText}>오늘</Text>
          </Pressable>
        )}
      </View>
      <Pressable accessibilityLabel={`다음 ${unitLabel}`} onPress={() => onMove(1)} style={({ pressed }) => [styles.calendarMonthButton, pressed && styles.pressedFeedback]}>
        <Ionicons color={bauhausColors.blue} name="chevron-forward" size={22} />
      </Pressable>
    </View>
  );
}
