import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { styles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import { ACTIVITY_WEATHER_ICONS, activityForecastColor } from '../../features/dashboard/activityWeatherIcons';
import type { buildHomeActivityGuideItems } from '../../features/dashboard/homeActivityGuidePresenter';
import { AppActionIcon } from '../shared/AppActionIcon';
import { tutorialTarget } from '../shared/TutorialTour';
import { WeatherIcon } from '../shared/WeatherIcon';

// 홈 맨 위 '오늘 일정' 카드: 다음에 할 일정 하나와 그때 날씨를 보여 줘서, 일정에 맞춰 날씨를 보는 앱이라는 게 첫 화면에서 보이게 합니다.
// 남은 일정이 없으면 오늘 일정을 바로 추가하는 버튼을 둡니다. 전체 목록은 아래 '일정 가이드' 탭에 있습니다.
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

  if (!next) {
    return (
      <Pressable
        accessibilityLabel={activityGuideRows.length ? '오늘 남은 일정이 없어요. 오늘 일정 추가' : '오늘 일정이 없어요. 오늘 일정 추가'}
        accessibilityRole="button"
        onPress={onAddToday}
        ref={tutorialTarget('homeToday')}
        style={({ pressed }) => [styles.homeTodayCard, pressed && styles.pressedFeedback]}
      >
        <View style={[styles.activityGuideIconBox, styles.homeTodayIconBox]}>
          <AppActionIcon name="schedule" size={26} />
        </View>
        <View style={styles.activityGuideTextGroup}>
          <Text style={styles.homeTodayEyebrow}>오늘 일정</Text>
          <Text numberOfLines={1} style={styles.homeTodayTitle}>{activityGuideRows.length ? '오늘 남은 일정이 없어요' : '오늘 일정이 없어요'}</Text>
          <Text numberOfLines={1} style={styles.homeTodayDesc}>일정을 적으면 그때 날씨를 알려 드려요</Text>
        </View>
        <View style={[styles.homeTodayAddChip, { borderColor: accentTone }]}>
          <Ionicons color={accentTone} name="add" size={15} />
          <Text style={[styles.homeTodayAddText, { color: accentTone }]}>추가</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel={`오늘 일정, ${next.timeLabel} ${next.title}. ${next.forecastLabel}. ${next.advice}`}
      accessibilityRole="button"
      onPress={onOpenCalendar}
      ref={tutorialTarget('homeToday')}
      style={({ pressed }) => [styles.homeTodayCard, pressed && styles.pressedFeedback]}
    >
      <View style={[styles.activityGuideIconBox, { backgroundColor: ACTIVITY_WEATHER_ICONS[next.weatherKind].background }]}>
        <WeatherIcon kind={ACTIVITY_WEATHER_ICONS[next.weatherKind].kind} size={28} />
      </View>
      <View style={styles.activityGuideTextGroup}>
        <Text style={styles.homeTodayEyebrow}>
          오늘 일정{upcoming.length > 1 ? ` · 외 ${upcoming.length - 1}개` : ''}
        </Text>
        <Text numberOfLines={1} style={styles.homeTodayTitle}>
          <Text style={{ color: accentTone }}>{next.timeLabel}</Text>  {next.title}
        </Text>
        <Text numberOfLines={1} style={[styles.homeTodayDesc, !!next.forecastLabel && { color: activityForecastColor(next.weatherKind) }]}>
          {next.forecastLabel || next.advice}
        </Text>
      </View>
      <Ionicons color={accentTone} name="chevron-forward" size={18} />
    </Pressable>
  );
}
