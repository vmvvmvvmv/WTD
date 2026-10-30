import { Pressable, Text } from 'react-native';

import { styles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import { AppActionIcon } from '../shared/AppActionIcon';

// 홈 '일정 가이드' 탭 맨 위, 오늘 일정이 없을 때 뜨는 한 줄. 누르면 캘린더가 오늘 창과 일정 추가 메뉴를 펼친 채 열립니다.
// 오늘 일정이 있으면 그 아래 목록이 일정별 날씨를 보여 주므로 이 줄은 없습니다.
export function HomeTodayScheduleCard({ onAddToday }: { onAddToday?: () => void }) {
  return (
    <Pressable
      accessibilityLabel="오늘 일정 없음. 오늘 일정 추가"
      accessibilityRole="button"
      onPress={onAddToday}
      style={({ pressed }) => [styles.homeTodayRow, pressed && styles.pressedFeedback]}
    >
      <AppActionIcon name="schedule" size={26} />
      <Text numberOfLines={1} style={styles.homeBestOutingText}>
        오늘 일정 없음
        <Text style={styles.homeBestOutingDetails}>  일정을 적으면 그때 날씨를 알려 드려요</Text>
      </Text>
      <Text style={[styles.homeTodayAddText, { color: accentTone }]}>+ 추가</Text>
    </Pressable>
  );
}
