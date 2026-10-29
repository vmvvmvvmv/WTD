import { Text, View } from 'react-native';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Reanimated, { Easing as ReanimatedEasing, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import type { CalendarEvent } from '../../types/calendar';
import type { HourlyDustItem, PastDustItem, PredictionResponse } from '../../types/dust';
import type { OutfitFigure, OutfitSensitivity } from '../../types/outfit';
import type { WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/weather';
import { findBestOutingWindow } from '../../features/dashboard/bestOutingWindow';
import { buildDefaultActivityGuides } from '../../features/dashboard/defaultActivityGuides';
import { buildHomeActivityGuideItems } from '../../features/dashboard/homeActivityGuidePresenter';
import { buildCalendarRiskByEvent, type CalendarLocationForecast } from '../calendar/calendarForecast';
import { isDateInEventRange } from '../calendar/calendarUtils';
import type { AppActionIconName } from '../shared/AppActionIcon';
import { OutfitCardContainer, type OutfitFallbackLocation } from '../outfit/OutfitCard';
import { HomeActivityGuideList } from './HomeActivityGuideList';
import { HomeHeroBanner } from './HomeHeroBanner';
import { HomeMapPreview } from './HomeMapPreview';
import { HomeSectionTabBar, type HomeSectionKey } from './HomeSectionTabBar';

const HOME_SECTION_TABS: { icon: AppActionIconName; key: HomeSectionKey; label: string }[] = [
  { icon: 'schedule', key: 'guide', label: '일정 가이드' },
  { icon: 'outfit', key: 'outfit', label: '추천 옷차림' },
  { icon: 'map', key: 'map', label: '날씨 지도' },
];

// 홈 탭: 위쪽 배너(HomeHeroBanner)와, 활동 가이드·추천 옷차림·날씨 지도를 탭으로 바꿔 보는 섹션을 묶습니다.
// 오늘 일정의 날씨 판단과 산책하기 좋은 시간은 여기서 한 번 계산해 배너와 가이드가 같이 씁니다.
export function HomePanel({
  tabBarTop,
  currentPm10,
  currentPm25,
  currentO3,
  calendarEvents,
  eventLocationForecasts,
  onDeleteCalendarEvent,
  onDeleteFollowingCalendarEvents,
  onOpenCalendar,
  onOpenMap,
  outfitEnabled,
  outfitFallbackLocation,
  outfitFigure,
  outfitSensitivity,
  sensitiveMode = false,
  mapPreviewUrl,
  hourlyItems,
  pastItems,
  loadFailed = false,
  loading = false,
  weatherHourlyItems,
  weatherMidTermItems,
  prediction,
  todayDateLabel,
  weather,
  yesterdayWeather,
}: {
  tabBarTop?: number;
  currentPm10?: number;
  currentPm25?: number;
  currentO3?: number;
  calendarEvents?: CalendarEvent[];
  eventLocationForecasts?: Record<string, CalendarLocationForecast>;
  onDeleteCalendarEvent?: (eventId: string) => void;
  onDeleteFollowingCalendarEvents?: (event: CalendarEvent) => void;
  onOpenCalendar?: () => void;
  onOpenMap: () => void;
  outfitEnabled: boolean;
  outfitFallbackLocation?: OutfitFallbackLocation;
  outfitFigure: OutfitFigure;
  outfitSensitivity: OutfitSensitivity;
  sensitiveMode?: boolean;
  mapPreviewUrl: string;
  hourlyItems: HourlyDustItem[];
  pastItems: PastDustItem[];
  // 서버에 연결하지 못해 보여줄 데이터가 없는 상태입니다. 단순히 아직 불러오는 중인 것과 구분합니다.
  loadFailed?: boolean;
  // 지역을 바꿔 새 데이터를 불러오는 중이면 배너 자리에 뼈대를 보여줍니다.
  loading?: boolean;
  weatherHourlyItems: WeatherHourlyItem[];
  weatherMidTermItems?: WeatherMidTermItem[];
  prediction: PredictionResponse | null;
  todayDateLabel: string;
  weather?: WeatherState | null;
  yesterdayWeather?: WeatherState | null;
}) {
  const reduceMotion = useReducedMotion();
  const [homeSectionTab, setHomeSectionTab] = useState<HomeSectionKey>('guide');
  const homeSectionTabs = HOME_SECTION_TABS.filter((tab) => outfitEnabled || tab.key !== 'outfit');
  const activeHomeSection = homeSectionTabs.some((tab) => tab.key === homeSectionTab) ? homeSectionTab : 'guide';
  const activeHomeSectionIndex = Math.max(0, homeSectionTabs.findIndex((tab) => tab.key === activeHomeSection));
  const now = new Date();
  const nowHour = now.getHours();
  const bestOutingWindow = useMemo(() => findBestOutingWindow({
    dustItems: hourlyItems,
    fallbackPm10: currentPm10,
    nowHour,
    sensitive: sensitiveMode,
    todayDateLabel,
    weatherItems: weatherHourlyItems,
  }), [currentPm10, hourlyItems, nowHour, sensitiveMode, todayDateLabel, weatherHourlyItems]);
  const todayCalendarEvents = useMemo(() => (calendarEvents ?? [])
    .filter((event) => isDateInEventRange(todayDateLabel, event))
    .sort((a, b) => a.time.localeCompare(b.time)), [calendarEvents, todayDateLabel]);
  const activityGuideRiskByEvent = useMemo(() => buildCalendarRiskByEvent(todayCalendarEvents, {
    currentPm10,
    eventLocationForecasts,
    hourlyItems,
    prediction,
    sensitiveMode,
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
  }), [currentPm10, eventLocationForecasts, hourlyItems, prediction, sensitiveMode, todayCalendarEvents, todayDateLabel, weather, weatherHourlyItems, weatherMidTermItems]);
  const currentTimeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const activityGuideRows = useMemo(
    () => buildHomeActivityGuideItems(todayCalendarEvents, activityGuideRiskByEvent, todayDateLabel, currentTimeLabel, sensitiveMode),
    [activityGuideRiskByEvent, currentTimeLabel, sensitiveMode, todayCalendarEvents, todayDateLabel],
  );
  // 오늘 일정이 없을 때만 오늘 날씨로 실외·실내·이동 기본 가이드를 만듭니다.
  const defaultActivityGuides = useMemo(
    () => (activityGuideRows.length > 0 ? [] : buildDefaultActivityGuides({
      bestWindow: bestOutingWindow,
      currentPm10,
      nowHour,
      sensitive: sensitiveMode,
      todayDateLabel,
      weatherItems: weatherHourlyItems,
    })),
    [activityGuideRows.length, bestOutingWindow, currentPm10, nowHour, sensitiveMode, todayDateLabel, weatherHourlyItems],
  );
  // 오늘 옷차림은 일정과 관계없이 지금부터 저녁까지를 하나의 외출로 보고 하루 날씨로 추천합니다.
  // 일정별 날씨는 위의 활동 가이드가 보여줍니다.
  const currentHour = now.getHours();
  const dayOutfitEvents = useMemo<CalendarEvent[]>(() => [{
    activityType: 'outdoor',
    date: todayDateLabel,
    endTime: currentHour < 21 ? '22:00' : '23:59',
    id: `day-outfit-${todayDateLabel}`,
    sensitive: false,
    time: `${String(currentHour).padStart(2, '0')}:00`,
    title: '외출',
  }], [currentHour, todayDateLabel]);
  // 홈 섹션 탭 전환: 밑줄은 고른 탭으로 미끄러지고, 새 내용은 이동한 방향에서 살짝 밀려 들어옵니다.
  // 내용 전환과 카드 높이 변화는 Reanimated로 화면 스레드에서 돌려, 탭을 바꿀 때 홈을 다시 그리는 JS 작업과 겹쳐도 끊기지 않게 합니다.
  const [sectionTabTouched, setSectionTabTouched] = useState(false);
  const sectionPaneDirection = useRef(1);
  const sectionPaneProgress = useSharedValue(1);
  const sectionPaneShift = useSharedValue(0);
  // 새 탭 내용이 화면에 그려지기 직전에 전환을 시작합니다(누른 순간에 시작하면 예전 내용이 먼저 움직임).
  const shownHomeSection = useRef(activeHomeSection);
  useLayoutEffect(() => {
    if (shownHomeSection.current === activeHomeSection) return;
    shownHomeSection.current = activeHomeSection;
    if (reduceMotion) return;
    sectionPaneShift.value = sectionPaneDirection.current * 16;
    sectionPaneProgress.value = 0;
    sectionPaneProgress.value = withTiming(1, { duration: 250, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) });
    sectionPaneShift.value = withTiming(0, { duration: 250, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) });
  }, [activeHomeSection, reduceMotion, sectionPaneProgress, sectionPaneShift]);
  const sectionPaneStyle = useAnimatedStyle(() => ({
    opacity: sectionPaneProgress.value,
    transform: [{ translateX: sectionPaneShift.value }],
  }));
  const selectHomeSection = (key: HomeSectionKey, index: number) => {
    if (key === activeHomeSection) return;
    sectionPaneDirection.current = index > activeHomeSectionIndex ? 1 : -1;
    setSectionTabTouched(true);
    setHomeSectionTab(key);
  };
  return (
    <View>
      <HomeHeroBanner
        bestOutingWindow={bestOutingWindow}
        currentO3={currentO3}
        currentPm10={currentPm10}
        currentPm25={currentPm25}
        loadFailed={loadFailed}
        loading={loading}
        pastItems={pastItems}
        todayDateLabel={todayDateLabel}
        weather={weather}
        weatherHourlyItems={weatherHourlyItems}
        yesterdayWeather={yesterdayWeather}
      />

      {/* 활동 가이드·옷차림·날씨 지도를 한 섹션의 탭으로 봅니다. 탭을 바꿔도 내용은 숨기기만 해서 다시 불러오지 않습니다. */}
      <Reanimated.View
        layout={reduceMotion ? undefined : LinearTransition.duration(250).easing(ReanimatedEasing.out(ReanimatedEasing.cubic))}
        style={styles.homeSectionCard}
      >
        <HomeSectionTabBar
          activeIndex={activeHomeSectionIndex}
          activeKey={activeHomeSection}
          animateIcon={sectionTabTouched && !reduceMotion}
          onSelect={selectHomeSection}
          reduceMotion={reduceMotion}
          tabs={homeSectionTabs}
        />

        <Reanimated.View style={sectionPaneStyle}>
        <HomeActivityGuideList
          activityGuideRows={activityGuideRows}
          defaultActivityGuides={defaultActivityGuides}
          hidden={activeHomeSection !== 'guide'}
          onDeleteCalendarEvent={onDeleteCalendarEvent}
          onDeleteFollowingCalendarEvents={onDeleteFollowingCalendarEvents}
          onOpenCalendar={onOpenCalendar}
          todayCalendarEvents={todayCalendarEvents}
        />


        {outfitEnabled && (
          <View style={activeHomeSection !== 'outfit' && styles.homeSectionHidden}>
            <Text numberOfLines={1} style={styles.homeSectionMeta}>
              {`지금부터 ${dayOutfitEvents[0].endTime === '23:59' ? '자정' : '밤 10시'}까지 날씨를 반영했어요`}
            </Text>
            <OutfitCardContainer enabled={outfitEnabled} events={dayOutfitEvents} fallbackLocation={outfitFallbackLocation} figure={outfitFigure} sensitivity={outfitSensitivity} showBothFigures />
          </View>
        )}

        <HomeMapPreview active={activeHomeSection === 'map'} mapPreviewUrl={mapPreviewUrl} onOpenMap={onOpenMap} tabBarTop={tabBarTop} />
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}
