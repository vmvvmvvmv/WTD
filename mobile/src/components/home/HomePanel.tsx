import { Animated, Easing, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Reanimated, { Easing as ReanimatedEasing, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import { bauhausColors, textColors } from '../../theme/bauhaus';
import type { CalendarEvent } from '../../types/calendar';
import type { HourlyDustItem, PastDustItem, PredictionResponse } from '../../types/dust';
import type { OutfitFigure, OutfitSensitivity } from '../../types/outfit';
import type { WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/weather';
import { toNumber } from '../../utils/format';
import { ACTIVITY_WEATHER_ICONS, activityForecastColor } from '../../features/dashboard/activityWeatherIcons';
import { bestOutingWindowText, findBestOutingWindow } from '../../features/dashboard/bestOutingWindow';
import { buildDefaultActivityGuides } from '../../features/dashboard/defaultActivityGuides';
import { buildHomeActivityGuideItems } from '../../features/dashboard/homeActivityGuidePresenter';
import { semanticColors } from '../../theme/semanticColors';
import { buildHomeMetricSlides } from '../../features/dashboard/homeMetricPresenter';
import { buildCalendarRiskByEvent, type CalendarLocationForecast } from '../calendar/calendarForecast';
import { getWeatherVisualKind } from '../../utils/weather';
import { isDateInEventRange } from '../calendar/calendarUtils';
import { confirmCalendarEventRemoval } from '../calendar/confirmCalendarEventRemoval';
import { AppActionIcon, type AppActionIconName } from '../shared/AppActionIcon';
import { WeatherIcon, weatherIconKind } from '../shared/WeatherIcon';
import { HomeBannerSkeleton } from './HomeBannerSkeleton';
import { OutfitCardContainer, type OutfitFallbackLocation } from '../outfit/OutfitCard';
import { accentTone } from '../../theme/appTheme';

import { getHomeWeatherMotionKind, HOME_METRIC_BACKGROUND_COLORS, HomeBannerScene } from './HomeWeatherScene';
import { HomeInfoGaugeSlide } from './HomeMetricGauge';
// 시간별 예보에서 고른 시간의 값을 "지금"과 비교하는 문구입니다.
function comparedToNow(value: number | undefined, nowValue: number | undefined, unit: string, decimals: number) {
  if (value === undefined || nowValue === undefined) return '지금 값과 비교할 수 없어요';
  const difference = Number((value - nowValue).toFixed(decimals));
  if (difference === 0) return '지금과 같아요';
  return `지금보다 ${Math.abs(difference)}${unit} ${difference > 0 ? '높아요' : '낮아요'}`;
}

type HomeSectionKey = 'guide' | 'outfit' | 'map';

const MAP_PREVIEW_MIN_HEIGHT = 156;
// 지도 아래에 남겨야 하는 높이: 지도 링크 줄 44 + 섹션 아래 여백 20 + 스크롤 아래 여백 30 + 하단 탭 바 69
const MAP_PREVIEW_BOTTOM_RESERVE = 44 + 20 + 30 + 69;

const HOME_SECTION_TABS: { ai?: boolean; icon: AppActionIconName; key: HomeSectionKey; label: string }[] = [
  { icon: 'schedule', key: 'guide', label: '활동 가이드' },
  { ai: true, icon: 'outfit', key: 'outfit', label: '추천 옷차림' },
  { icon: 'map', key: 'map', label: '날씨 지도' },
];

// 탭을 고른 순간 아이콘이 한 번만 살짝 튀어 오릅니다. 계속 움직이는 건 홈 배너 하나로 둡니다.
function HomeTabSelectedIcon({ animate, name, size }: { animate: boolean; name: AppActionIconName; size: number }) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    const animation = Animated.spring(progress, { damping: 9, stiffness: 220, toValue: 1, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [animate, progress]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
        ],
      }}
    >
      <AppActionIcon name={name} size={size} />
    </Animated.View>
  );
}

// 홈 탭의 현재 미세먼지 상태, 주요 오염물질 카드, 최근/예측 흐름을 보여줍니다.
export function HomePanel({
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
  const { fontScale, height: windowHeight, width: windowWidth } = useWindowDimensions();
  // 지도 탭을 열면 지도가 하단 탭 바 바로 위까지 닿도록, 화면에서 지도가 시작하는 위치를 재서 높이를 정합니다.
  const mapPaneRef = useRef<View>(null);
  const [mapFrameHeight, setMapFrameHeight] = useState(MAP_PREVIEW_MIN_HEIGHT);
  const measureMapPane = () => {
    mapPaneRef.current?.measureInWindow((_x, y) => {
      setMapFrameHeight(Math.max(MAP_PREVIEW_MIN_HEIGHT, Math.round(windowHeight - y - MAP_PREVIEW_BOTTOM_RESERVE)));
    });
  };
  const infoCarouselRef = useRef<ScrollView>(null);
  const [activeInfoSlide, setActiveInfoSlide] = useState(0);
  const reduceMotion = useReducedMotion();
  // 한 번이라도 화면에 들어온 게이지 슬라이드. 처음 들어올 때만 호가 차오릅니다.
  const [revealedSlides, setRevealedSlides] = useState<ReadonlySet<string>>(() => new Set());
  const [carouselIndex, setCarouselIndex] = useState(1);
  const [homeSectionTab, setHomeSectionTab] = useState<HomeSectionKey>('guide');
  const homeSectionTabs = HOME_SECTION_TABS.filter((tab) => outfitEnabled || tab.key !== 'outfit');
  const activeHomeSection = homeSectionTabs.some((tab) => tab.key === homeSectionTab) ? homeSectionTab : 'guide';
  const activeHomeSectionIndex = Math.max(0, homeSectionTabs.findIndex((tab) => tab.key === activeHomeSection));
  const [mapPreviewFailed, setMapPreviewFailed] = useState(false);
  const [mapPreviewRetryCount, setMapPreviewRetryCount] = useState(0);
  const infoSlideWidth = windowWidth;
  const infoSlideHeight = Math.max(146, Math.ceil(146 * fontScale));
  const infoGaugeSize = infoSlideWidth < 290 ? 106 : infoSlideWidth < 350 ? 114 : 120;
  useEffect(() => {
    setMapPreviewFailed(false);
    setMapPreviewRetryCount(0);
  }, [mapPreviewUrl]);
  useEffect(() => {
    if (!mapPreviewFailed || mapPreviewRetryCount >= 3) return;
    const retryDelays = [1200, 3000, 6000];
    const timer = setTimeout(() => {
      setMapPreviewFailed(false);
      setMapPreviewRetryCount((count) => count + 1);
    }, retryDelays[mapPreviewRetryCount]);
    return () => clearTimeout(timer);
  }, [mapPreviewFailed, mapPreviewRetryCount]);
  const now = new Date();
  const hourlyForecastItems = weatherHourlyItems
    .map((item, index) => {
      const itemDate = item.date || item.measuredAt?.slice(0, 10) || '';
      const itemTime = item.hour?.slice(0, 5) || item.measuredAt?.slice(11, 16) || '--:--';
      const isCurrent = itemDate === todayDateLabel && Number(itemTime.slice(0, 2)) === now.getHours();
      const rainProbability = toNumber(item.rain_probability);
      const visualKind = getWeatherVisualKind(item.label);
      return {
        isCurrent,
        // 비·눈이 예보됐거나 강수확률 60% 이상인 시간은 파란색으로 강조합니다.
        isRainy: visualKind === 'rain' || visualKind === 'snow' || (rainProbability ?? 0) >= 60 || (toNumber(item.rain_mm) ?? 0) > 0,
        key: `${itemDate || item.measuredAt || 'hour'}-${item.hour || index}`,
        label: item.label || '날씨 확인 중',
        rainMm: toNumber(item.rain_mm),
        rainProbability,
        temperature: toNumber(item.temperature),
        windSpeed: item.wind_speed,
        timeLabel: isCurrent
          ? '지금'
          : itemDate === todayDateLabel
            ? itemTime
            : itemDate
              ? `${itemDate.slice(5).replace('-', '/')} ${itemTime}`
              : itemTime,
      };
    });
  const bannerForecastItems = hourlyForecastItems;
  // 시간별 예보 줄에서 고른 시간. null이면 "지금"입니다. 고른 시간이 지나가 목록에서 빠지면 저절로 "지금"으로 돌아갑니다.
  const [selectedForecastKey, setSelectedForecastKey] = useState<string | null>(null);
  const selectedForecastIndex = selectedForecastKey ? bannerForecastItems.findIndex((item) => item.key === selectedForecastKey) : -1;
  // 배너에서 고른 시간을 따라가는 값은 기온과 강수량뿐입니다. 습도·바람·미세먼지는 계속 "지금" 값입니다.
  // "지금" 칸이 맨 앞이 아닐 수 있습니다(직전 시각의 실측이 먼저 오는 경우). 그래서 위치가 아니라 isCurrent로 찾습니다.
  const nowForecastIndex = Math.max(0, bannerForecastItems.findIndex((item) => item.isCurrent));
  const peekForecast = selectedForecastIndex >= 0 && selectedForecastIndex !== nowForecastIndex ? bannerForecastItems[selectedForecastIndex] : undefined;
  const infoSlides = useMemo(() => buildHomeMetricSlides({
    currentO3,
    currentPm10,
    currentPm25,
    gaugeSize: infoGaugeSize,
    pastItems,
    todayDateLabel,
    weather: peekForecast && weather
      ? { ...weather, label: peekForecast.label, rainMm: peekForecast.rainMm, temperature: peekForecast.temperature }
      : weather,
    yesterdayWeather,
  }).map((slide) => {
    if (loadFailed && (slide.value === '-' || slide.value === '--')) {
      return { ...slide, comparison: '연결되면 다시 보여드려요', status: '연결 안 됨' };
    }
    if (!peekForecast) return slide;
    if (slide.label === '기온') return { ...slide, comparison: comparedToNow(peekForecast.temperature, weather?.temperature, '°', 0) };
    if (slide.label === '강수량') return { ...slide, comparison: comparedToNow(peekForecast.rainMm, weather?.rainMm, 'mm', 1) };
    return { ...slide, title: `${slide.title} · 지금` };
  }), [currentO3, currentPm10, currentPm25, infoGaugeSize, loadFailed, pastItems, peekForecast, todayDateLabel, weather, yesterdayWeather]);
  const infoSlideCount = infoSlides.length;
  const carouselSlides = [infoSlides[infoSlideCount - 1], ...infoSlides, infoSlides[0]];
  const visibleSlideLabels = [infoSlides[activeInfoSlide]?.label, carouselSlides[carouselIndex]?.label].filter((label): label is string => !!label);
  const visibleSlideKey = visibleSlideLabels.join('|');
  useEffect(() => {
    if (loading) return;
    setRevealedSlides((current) => (visibleSlideLabels.every((label) => current.has(label))
      ? current
      : new Set([...current, ...visibleSlideLabels])));
    // visibleSlideKey가 visibleSlideLabels를 대신합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, visibleSlideKey]);
  // 지역을 바꾸면(뼈대 로딩) 고른 시간과 "이미 본 슬라이드"를 처음 상태로 돌립니다.
  const bannerOpacity = useRef(new Animated.Value(1)).current;
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (loading) {
      setSelectedForecastKey(null);
      setRevealedSlides(new Set());
      // 배너가 다시 나타날 때 한 프레임이라도 그대로 보이지 않게 미리 투명하게 둡니다.
      if (!reduceMotion) bannerOpacity.setValue(0);
    } else if (wasLoading.current) {
      // 뼈대에서 실제 화면으로 0.3초에 걸쳐 바뀝니다.
      if (reduceMotion) bannerOpacity.setValue(1);
      else Animated.timing(bannerOpacity, { duration: 300, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }).start();
    }
    wasLoading.current = loading;
  }, [bannerOpacity, loading, reduceMotion]);
  useEffect(() => {
    const timer = setInterval(() => {
      setCarouselIndex((current) => current + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    infoCarouselRef.current?.scrollTo({ animated: carouselIndex !== 1, x: carouselIndex * infoSlideWidth });
  }, [carouselIndex, infoSlideWidth]);
  const nowHour = now.getHours();
  const bestOutingWindow = useMemo(() => findBestOutingWindow({
    dustItems: hourlyItems,
    fallbackPm10: currentPm10,
    nowHour,
    sensitive: sensitiveMode,
    todayDateLabel,
    weatherItems: weatherHourlyItems,
  }), [currentPm10, hourlyItems, nowHour, sensitiveMode, todayDateLabel, weatherHourlyItems]);
  const bestOutingText = bestOutingWindow ? bestOutingWindowText(bestOutingWindow) : null;
  const hasHourlyForecast = bannerForecastItems.length > 0;
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
  // 배너 배경과 날씨 효과도 고른 시간의 날씨를 따라갑니다.
  const bannerWeatherLabel = peekForecast ? peekForecast.label : weather?.label;
  const weatherVisualKind = getWeatherVisualKind(bannerWeatherLabel);
  const weatherMotionKind = getHomeWeatherMotionKind(bannerWeatherLabel, peekForecast ? peekForecast.windSpeed : weather?.windSpeed);
  const weatherBackgroundKind = weatherMotionKind === 'wind' ? 'cloudy' : weatherVisualKind;
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
  // 시간별 예보 줄: 칸을 누르면 그 시간을 고릅니다. 줄은 원래대로 맨 왼쪽부터 시작합니다.
  const shownForecastIndex = selectedForecastIndex >= 0 ? selectedForecastIndex : nowForecastIndex;
  const selectForecastIndex = (index: number) => {
    const item = bannerForecastItems[index];
    if (!item || index === shownForecastIndex) return;
    setSelectedForecastKey(index === nowForecastIndex ? null : item.key);
    Haptics.selectionAsync().catch(() => {});
  };
  // 홈 섹션 탭 전환: 밑줄은 고른 탭으로 미끄러지고, 새 내용은 이동한 방향에서 살짝 밀려 들어옵니다.
  // 내용 전환과 카드 높이 변화는 Reanimated로 화면 스레드에서 돌려, 탭을 바꿀 때 홈을 다시 그리는 JS 작업과 겹쳐도 끊기지 않게 합니다.
  const [sectionTabRowWidth, setSectionTabRowWidth] = useState(0);
  const sectionTabWidth = homeSectionTabs.length > 0 ? sectionTabRowWidth / homeSectionTabs.length : 0;
  const sectionIndicatorX = useRef(new Animated.Value(0)).current;
  const [sectionTabTouched, setSectionTabTouched] = useState(false);
  const sectionPaneDirection = useRef(1);
  const sectionPaneProgress = useSharedValue(1);
  const sectionPaneShift = useSharedValue(0);
  useEffect(() => {
    const x = activeHomeSectionIndex * sectionTabWidth;
    if (reduceMotion) sectionIndicatorX.setValue(x);
    else Animated.timing(sectionIndicatorX, { duration: 250, easing: Easing.out(Easing.cubic), toValue: x, useNativeDriver: true }).start();
  }, [activeHomeSectionIndex, reduceMotion, sectionIndicatorX, sectionTabWidth]);
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
      {loading ? (
        <HomeBannerSkeleton bannerHeight={infoSlideHeight + 12} reduceMotion={reduceMotion} />
      ) : (
      <Animated.View style={[styles.homeHeroBanner, { opacity: bannerOpacity }]}>
        <View style={styles.homeHeroBannerImage}>
          <View style={styles.homeHeroBannerBottom}>
            <View style={[styles.homeGaugeFeature, { backgroundColor: HOME_METRIC_BACKGROUND_COLORS[weatherBackgroundKind] }]}>
              <HomeBannerScene animate={!reduceMotion} scene={{ background: weatherBackgroundKind, motion: weatherMotionKind }} />
            <View style={[styles.homeInfoCarouselViewport, { height: infoSlideHeight }]}>
              <ScrollView
                ref={infoCarouselRef}
                contentOffset={{ x: infoSlideWidth, y: 0 }}
                horizontal
                pagingEnabled
                style={[styles.homeInfoCarousel, { height: infoSlideHeight }]}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                  const next = Math.round(event.nativeEvent.contentOffset.x / infoSlideWidth);
                  if (next === 0) {
                    infoCarouselRef.current?.scrollTo({ animated: false, x: infoSlideCount * infoSlideWidth });
                    setCarouselIndex(infoSlideCount);
                    setActiveInfoSlide(infoSlideCount - 1);
                    return;
                  }
                  if (next === infoSlideCount + 1) {
                    infoCarouselRef.current?.scrollTo({ animated: false, x: infoSlideWidth });
                    setCarouselIndex(1);
                    setActiveInfoSlide(0);
                    return;
                  }
                  setCarouselIndex(next);
                  setActiveInfoSlide(next - 1);
                }}
              >
                {carouselSlides.map((slide, index) => (
                  <HomeInfoGaugeSlide
                    key={`${slide.label}-${index}`}
                    {...slide}
                    animate={!reduceMotion}
                    revealed={revealedSlides.has(slide.label)}
                    slideHeight={infoSlideHeight}
                    width={infoSlideWidth}
                  />
                ))}
              </ScrollView>
              <View pointerEvents="none" style={styles.homeInfoCarouselDots}>
                {Array.from({ length: infoSlideCount }, (_, index) => (
                  <View key={`info-dot-${index}`} style={[styles.homeInfoCarouselDot, index === activeInfoSlide && { backgroundColor: '#FFFFFF', width: 15 }]} />
                ))}
              </View>
            </View>
            </View>
            <View style={styles.homeHeroBannerForecastSection}>
              {hasHourlyForecast ? (
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.homeHeroBannerForecastContent}
                  style={styles.homeHeroBannerForecastScroll}
                >
                  {bannerForecastItems.map((item, index) => {
                    const selected = index === shownForecastIndex;
                    return (
                    <Pressable
                      key={item.key}
                      accessibilityLabel={`${item.timeLabel} ${item.label} ${item.temperature === undefined ? '' : `${Math.round(item.temperature)}도`}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => selectForecastIndex(index)}
                      style={[styles.homeHeroBannerForecastItem, selected && styles.homeHeroBannerForecastItemCurrent]}
                    >
                      <Text style={[styles.homeHeroBannerForecastTime, selected && styles.homeHeroBannerForecastTimeCurrent]}>{item.timeLabel}</Text>
                      <WeatherIcon kind={weatherIconKind(item.label)} size={23} />
                      <Text style={styles.homeHeroBannerForecastTemp}>
                        {item.temperature === undefined ? '-' : `${Math.round(item.temperature)}°`}
                      </Text>
                      <Text style={[styles.homeHeroBannerForecastRain, item.isRainy && styles.homeHeroBannerForecastRainActive]}>
                        {item.rainProbability === undefined ? '강수 -' : `강수 ${Math.round(item.rainProbability)}%`}
                      </Text>
                    </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.homeHeroBannerForecastEmpty}>
                  <Ionicons color="#7890AE" name={loadFailed ? 'cloud-offline-outline' : 'time-outline'} size={18} />
                  <Text style={styles.homeHeroBannerForecastEmptyText}>
                    {loadFailed ? '서버에 연결되지 않아 예보를 불러오지 못했어요' : '시간별 예보를 준비 중이에요'}
                  </Text>
                </View>
              )}
              {hasHourlyForecast && nowHour < 22 && (
                <View
                  accessible
                  accessibilityLabel={bestOutingText
                    ? `오늘 산책하기 좋은 시간 ${bestOutingText.time}. ${bestOutingText.details}`
                    : '오늘은 밖에 오래 있기 좋은 시간이 없어요'}
                  style={styles.homeBestOutingRow}
                >
                  <AppActionIcon name="activityOutdoor" size={26} style={bestOutingText ? undefined : { opacity: 0.45 }} />
                  {bestOutingText ? (
                    <Text numberOfLines={1} style={styles.homeBestOutingText}>
                      산책하기 좋은 시간 <Text style={styles.homeBestOutingTime}>{bestOutingText.time}</Text>
                      {!!bestOutingText.details && <Text style={styles.homeBestOutingDetails}>{`  ${bestOutingText.details}`}</Text>}
                    </Text>
                  ) : (
                    <Text numberOfLines={1} style={styles.homeBestOutingDetails}>오늘은 밖에 오래 있기 좋은 시간이 없어요</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
      </Animated.View>
      )}

      {/* 활동 가이드·옷차림·날씨 지도를 한 섹션의 탭으로 봅니다. 탭을 바꿔도 내용은 숨기기만 해서 다시 불러오지 않습니다. */}
      <Reanimated.View
        layout={reduceMotion ? undefined : LinearTransition.duration(250).easing(ReanimatedEasing.out(ReanimatedEasing.cubic))}
        style={styles.homeSectionCard}
      >
        <View accessibilityRole="tablist" onLayout={(event) => setSectionTabRowWidth(event.nativeEvent.layout.width)} style={styles.homeSectionTabRow}>
          {homeSectionTabs.map((tab, index) => {
            const selected = tab.key === activeHomeSection;
            return (
              <Pressable
                accessibilityLabel={tab.ai ? `${tab.label}, AI 추천` : tab.label}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={tab.key}
                onPress={() => selectHomeSection(tab.key, index)}
                style={({ pressed }) => [styles.homeSectionTab, pressed && styles.pressedFeedback]}
              >
                {selected
                  ? <HomeTabSelectedIcon animate={sectionTabTouched && !reduceMotion} name={tab.icon} size={24} />
                  : <AppActionIcon name={tab.icon} size={24} style={styles.homeSectionTabIconMuted} />}
                <View style={styles.homeSectionTabLabelRow}>
                  {tab.ai && <Ionicons color={selected ? bauhausColors.blue : textColors.disabled} name="sparkles" size={11} />}
                  <Text style={[styles.homeSectionTabText, selected && styles.homeSectionTabTextSelected]}>{tab.label}</Text>
                </View>
              </Pressable>
            );
          })}
          {sectionTabWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[styles.homeSectionTabIndicator, { backgroundColor: accentTone, transform: [{ translateX: sectionIndicatorX }], width: sectionTabWidth }]}
            />
          )}
        </View>

        <Reanimated.View style={sectionPaneStyle}>
        <View style={activeHomeSection !== 'guide' && styles.homeSectionHidden}>
          {/* 기본 가이드라는 것을 추천 옷차림의 'AI 추천' 줄과 같은 모양으로 알립니다. */}
          {activityGuideRows.length === 0 && (
            <View accessibilityLabel="기본 가이드. 오늘 등록된 일정이 없어 기본 가이드로 안내드립니다" accessible style={styles.defaultGuideSourceRow}>
              <Ionicons color={textColors.secondary} name="compass-outline" size={15} />
              <Text style={styles.defaultGuideSourceTitle}>기본 가이드</Text>
              <Text style={styles.defaultGuideSourceHint}>오늘 등록된 일정이 없어 기본 가이드로 안내드립니다</Text>
            </View>
          )}
          {defaultActivityGuides.length > 0 && (
            <View style={styles.activityGuideList}>
              {defaultActivityGuides.map((guide) => (
                <Pressable
                  accessibilityLabel={`기본 가이드, ${guide.title}. ${guide.detail}. 일정 추가하러 가기`}
                  key={guide.key}
                  onPress={onOpenCalendar}
                  style={({ pressed }) => [styles.activityGuideRow, pressed && styles.pressedFeedback]}
                >
                  <View style={[styles.activityGuideIconBox, { backgroundColor: guide.caution ? semanticColors.weather.caution.soft : bauhausColors.blueSoft }]}>
                    <AppActionIcon name={guide.icon} size={30} />
                  </View>
                  <View style={styles.activityGuideTextGroup}>
                    <Text numberOfLines={1} style={styles.activityGuideRowTitle}>{guide.title}</Text>
                    <Text numberOfLines={2} style={styles.activityGuideRowDesc}>{guide.detail}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          {activityGuideRows.length > 0 && <View style={styles.activityGuideList}>
            {activityGuideRows.map((item) => {
              const completed = item.isCompleted;
              return (
                <View key={item.id} style={styles.activityGuideItemGroup}>
                  <Pressable
                    accessibilityLabel={`${item.title}${completed ? ', 완료한 일정' : ''}, 캘린더에서 보기`}
                    onPress={onOpenCalendar}
                    style={({ pressed }) => [styles.activityGuideRow, completed && styles.activityGuideRowCompleted, pressed && styles.pressedFeedback]}
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
                  </Pressable>
                </View>
              );
            })}
          </View>}
          {/* \uC77C\uC815\uC774 \uC788\uB4E0 \uC5C6\uB4E0 \uBAA9\uB85D \uC544\uB798\uC5D0 \uAC19\uC740 '\uC77C\uC815 \uCD94\uAC00\uD558\uB7EC \uAC00\uAE30' \uBC84\uD2BC\uC744 \uB461\uB2C8\uB2E4. */}
          <Pressable
            accessibilityLabel={"\uC77C\uC815 \uCD94\uAC00\uD558\uB7EC \uAC00\uAE30"}
            onPress={onOpenCalendar}
            style={({ pressed }) => [styles.activityGuideAddScheduleButton, pressed && styles.pressedFeedback]}
          >
            <View style={styles.activityGuideAddScheduleIcon}>
              <AppActionIcon name="schedule" size={27} />
            </View>
            <Text style={[styles.activityGuideAddScheduleText, { color: accentTone }]}>{"\uC77C\uC815 \uCD94\uAC00\uD558\uB7EC \uAC00\uAE30"}</Text>
            <Ionicons color={accentTone} name="chevron-forward" size={16} />
          </Pressable>
        </View>

        {outfitEnabled && (
          <View style={activeHomeSection !== 'outfit' && styles.homeSectionHidden}>
            <Text numberOfLines={1} style={styles.homeSectionMeta}>
              {`지금부터 ${dayOutfitEvents[0].endTime === '23:59' ? '자정' : '밤 10시'}까지 날씨를 반영했어요`}
            </Text>
            <OutfitCardContainer enabled={outfitEnabled} enhanceWithLlm events={dayOutfitEvents} fallbackLocation={outfitFallbackLocation} figure={outfitFigure} sensitivity={outfitSensitivity} showBothFigures />
          </View>
        )}

        <Pressable
          accessibilityLabel={"\uC804\uAD6D \uC9C0\uB3C4 \uB0A0\uC528 \uBCF4\uB7EC\uAC00\uAE30"}
          onLayout={activeHomeSection === 'map' ? measureMapPane : undefined}
          onPress={onOpenMap}
          ref={mapPaneRef}
          style={({ pressed }) => [activeHomeSection !== 'map' && styles.homeSectionHidden, pressed && styles.pressedFeedback]}
        >
          <View style={[styles.homeMapPreviewFrame, { height: mapFrameHeight }]} pointerEvents="none">
            {mapPreviewFailed || !mapPreviewUrl ? (
              <View style={styles.homeMapPreviewFallback}>
                <AppActionIcon name="map" size={37} />
                <Text style={styles.homeMapPreviewFallbackText}>지도를 불러올 수 없어요</Text>
              </View>
            ) : (
              <WebView
                key={`${mapPreviewUrl}-${mapPreviewRetryCount}`}
                source={{ uri: mapPreviewUrl }}
                javaScriptEnabled
                domStorageEnabled
                androidLayerType="hardware"
                mixedContentMode="always"
                onLoad={() => {
                  setMapPreviewFailed(false);
                }}
                onError={() => setMapPreviewFailed(true)}
                onHttpError={() => setMapPreviewFailed(true)}
                originWhitelist={['*']}
                setSupportMultipleWindows={false}
                thirdPartyCookiesEnabled
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                style={styles.homeMapPreviewWebView}
              />
            )}
          </View>
          <View style={styles.homeMapPreviewFooter}>
            <Text style={[styles.homeMapPreviewLink, { color: accentTone }]}>{"\uC804\uAD6D \uC9C0\uB3C4 \uB0A0\uC528 \uBCF4\uB7EC\uAC00\uAE30"}</Text>
            <Ionicons color={accentTone} name="chevron-forward" size={17} />
          </View>
        </Pressable>
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}

