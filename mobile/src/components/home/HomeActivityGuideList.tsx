import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { styles } from '../../styles/appStyles';
import { bauhausColors } from '../../theme/bauhaus';
import { semanticColors } from '../../theme/semanticColors';
import { accentTone } from '../../theme/appTheme';
import type { CalendarEvent } from '../../types/calendar';
import { ACTIVITY_WEATHER_ICONS, activityForecastColor } from '../../features/dashboard/activityWeatherIcons';
import type { buildDefaultActivityGuides } from '../../features/dashboard/defaultActivityGuides';
import type { buildHomeActivityGuideItems } from '../../features/dashboard/homeActivityGuidePresenter';
import { confirmCalendarEventRemoval } from '../calendar/confirmCalendarEventRemoval';
import { AppActionIcon } from '../shared/AppActionIcon';
import { WeatherIcon } from '../shared/WeatherIcon';
import { HomeTodayScheduleCard } from './HomeTodayScheduleCard';

// 홈 '활동 가이드' 탭: 오늘 일정마다 날씨 판단을 보여 주고, 일정이 없으면 오늘 날씨로 만든 기본 가이드를 보여 줍니다.
export function HomeActivityGuideList({
  activityGuideRows,
  defaultActivityGuides,
  hidden,
  onAddToday,
  onDeleteCalendarEvent,
  onDeleteFollowingCalendarEvents,
  onOpenCalendar,
  todayCalendarEvents,
}: {
  activityGuideRows: ReturnType<typeof buildHomeActivityGuideItems>;
  defaultActivityGuides: ReturnType<typeof buildDefaultActivityGuides>;
  hidden: boolean;
  onAddToday?: () => void;
  onDeleteCalendarEvent?: (eventId: string) => void;
  onDeleteFollowingCalendarEvents?: (event: CalendarEvent) => void;
  onOpenCalendar?: () => void;
  todayCalendarEvents: CalendarEvent[];
}) {
  return (
    <View style={hidden && styles.homeSectionHidden}>
      {/* 오늘 일정이 없으면 맨 위에 '오늘 일정 없음 · + 추가' 줄을 둡니다. 아래 기본 가이드는 오늘 날씨로 만든 것입니다. */}
      {activityGuideRows.length === 0 && <HomeTodayScheduleCard onAddToday={onAddToday} />}
      {defaultActivityGuides.length > 0 && (
        <View style={styles.activityGuideList}>
          {defaultActivityGuides.map((guide) => (
            <View
              accessibilityLabel={`기본 가이드, ${guide.title}. ${guide.detail}`}
              key={guide.key}
              style={styles.activityGuideRow}
            >
              <View style={[styles.activityGuideIconBox, { backgroundColor: guide.caution ? semanticColors.weather.caution.soft : bauhausColors.blueSoft }]}>
                <AppActionIcon name={guide.icon} size={30} />
              </View>
              <View style={styles.activityGuideTextGroup}>
                <Text numberOfLines={1} style={styles.activityGuideRowTitle}>{guide.title}</Text>
                <Text numberOfLines={2} style={styles.activityGuideRowDesc}>{guide.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {activityGuideRows.length > 0 && <View style={styles.activityGuideList}>
        {activityGuideRows.map((item) => {
          const completed = item.isCompleted;
          return (
            <View key={item.id} style={styles.activityGuideItemGroup}>
              <View
                accessibilityLabel={`${item.title}${completed ? ', 완료한 일정' : ''}`}
                style={[styles.activityGuideRow, completed && styles.activityGuideRowCompleted]}
              >
                <View
                  accessibilityLabel={item.forecastLabel || undefined}
                  style={[styles.activityGuideIconBox, completed ? styles.activityGuideIconBoxCompleted : { backgroundColor: ACTIVITY_WEATHER_ICONS[item.weatherKind].background }]}
                >
                  <WeatherIcon kind={ACTIVITY_WEATHER_ICONS[item.weatherKind].kind} size={29} style={completed ? { opacity: 0.45 } : undefined} />
                </View>
                <View style={styles.activityGuideTextGroup}>
                  <View style={styles.activityGuideTitleRow}>
                    <Text numberOfLines={1} style={[styles.activityGuideRowTitle, completed && styles.activityGuideRowTitleCompleted]}>{item.title}</Text>
                    {completed ? (
                      <View style={styles.activityGuideCompletedBadge}>
                        <Ionicons color="#63748A" name="checkmark" size={11} />
                        <Text style={styles.activityGuideCompletedBadgeText}>완료</Text>
                      </View>
                    ) : (
                      <View style={[styles.activityGuideRiskBadge, { backgroundColor: item.riskSoftTone, borderColor: item.riskBorderTone }]}>
                        <View style={[styles.activityGuideRiskDot, { backgroundColor: item.riskTone }]} />
                        <Text style={[styles.activityGuideRiskBadgeText, { color: item.riskTone }]}>{item.riskLabel}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.activityGuideMetaRow}>
                    <Text style={[styles.activityGuideTimeText, completed && styles.activityGuideMetaCompleted]}>{item.timeLabel}</Text>
                    {!!item.locationLabel && <><View style={styles.activityGuideMetaDivider} /><Text numberOfLines={1} style={[styles.activityGuideRowLocation, completed && styles.activityGuideMetaCompleted]}>{item.locationLabel}</Text></>}
                  </View>
                  {!completed && !!item.forecastLabel && (
                    <Text
                      numberOfLines={1}
                      style={[styles.activityGuideForecast, { color: activityForecastColor(item.weatherKind) }]}
                    >
                      {item.forecastLabel}
                    </Text>
                  )}
                  <Text numberOfLines={2} style={[styles.activityGuideRowDesc, completed && styles.activityGuideMetaCompleted]}>{completed ? '완료한 일정이에요.' : item.advice}</Text>
                </View>
                <Pressable
                  accessibilityLabel={`${item.title} 일정 삭제`}
                  hitSlop={8}
                  onPress={(pressEvent) => {
                    pressEvent.stopPropagation();
                    const calendarEvent = todayCalendarEvents.find((event) => event.id === item.id);
                    if (!calendarEvent) return;
                    confirmCalendarEventRemoval(calendarEvent, {
                      removeFollowing: () => onDeleteFollowingCalendarEvents?.(calendarEvent),
                      removeOne: () => onDeleteCalendarEvent?.(item.id),
                    });
                  }}
                  style={({ pressed }) => [styles.activityGuideDeleteButton, pressed && styles.pressedFeedback]}
                >
                  <AppActionIcon name="delete" size={22} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>}
      {/* 일정이 있든 없든 목록 아래에 같은 '일정 추가하러 가기' 버튼을 둡니다. */}
      <Pressable
        accessibilityLabel={"일정 추가하러 가기"}
        onPress={onOpenCalendar}
        style={({ pressed }) => [styles.activityGuideAddScheduleButton, pressed && styles.pressedFeedback]}
      >
        <View style={styles.activityGuideAddScheduleIcon}>
          <AppActionIcon name="schedule" size={27} />
        </View>
        <Text style={[styles.activityGuideAddScheduleText, { color: accentTone }]}>{"일정 추가하러 가기"}</Text>
        <Ionicons color={accentTone} name="chevron-forward" size={16} />
      </Pressable>
    </View>
  );
}
