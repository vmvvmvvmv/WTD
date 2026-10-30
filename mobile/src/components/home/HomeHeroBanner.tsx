import { Animated, Easing, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import type { PastDustItem } from '../../types/dust';
import type { WeatherHourlyItem, WeatherState } from '../../types/weather';
import { toNumber } from '../../utils/format';
import { addDays, toIsoDate } from '../../utils/date';
import { weekdayLabels } from '../calendar/calendarUtils';
import { bestOutingWindowText, type findBestOutingWindow } from '../../features/dashboard/bestOutingWindow';
import { buildHomeMetricSlides } from '../../features/dashboard/homeMetricPresenter';
import { getWeatherVisualKind } from '../../utils/weather';
import { AppActionIcon } from '../shared/AppActionIcon';
import { tutorialTarget } from '../shared/TutorialTour';
import { WeatherIcon, weatherIconKind } from '../shared/WeatherIcon';
import { HomeForecastHourStrip } from './HomeForecastHourStrip';
import { HomeBannerSkeleton } from './HomeBannerSkeleton';
import { getHomeWeatherMotionKind, HOME_METRIC_BACKGROUND_COLORS, HomeBannerScene } from './HomeWeatherScene';
import { HomeInfoGaugeSlide } from './HomeMetricGauge';

// 시간별 예보에서 고른 시간의 값을 "지금"과 비교하는 문구입니다.
function comparedToNow(value: number | undefined, nowValue: number | undefined, unit: string, decimals: number) {
  if (value === undefined || nowValue === undefined) return '지금 값과 비교할 수 없어요';
  const difference = Number((value - nowValue).toFixed(decimals));
  if (difference === 0) return '지금과 같아요';
  return `지금보다 ${Math.abs(difference)}${unit} ${difference > 0 ? '높아요' : '낮아요'}`;
}

// 홈 맨 위 배너: 지표 슬라이드(미세먼지·기온 등), 시간별 예보 줄, 산책하기 좋은 시간.
// 예보 줄에서 시간을 고르면 기온·강수량 슬라이드와 배너 날씨 효과가 그 시간을 따라갑니다.
export function HomeHeroBanner({
  bestOutingWindow,
  currentO3,
  currentPm10,
  currentPm25,
  loadFailed,
  loading,
  pastItems,
  todayDateLabel,
  weather,
  weatherHourlyItems,
  weatherTodayPastItems = [],
  yesterdayWeather,
}: {
  bestOutingWindow: ReturnType<typeof findBestOutingWindow>;
  currentO3?: number;
  currentPm10?: number;
  currentPm25?: number;
  loadFailed: boolean;
  loading: boolean;
  pastItems: PastDustItem[];
  todayDateLabel: string;
  weather?: WeatherState | null;
  weatherHourlyItems: WeatherHourlyItem[];
  weatherTodayPastItems?: WeatherHourlyItem[];
  yesterdayWeather?: WeatherState | null;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const infoCarouselRef = useRef<ScrollView>(null);
  const carouselIndexRef = useRef(1);
  const pauseCarouselUntil = useRef(0);
  const carouselResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeInfoSlide, setActiveInfoSlide] = useState(0);
  const reduceMotion = useReducedMotion();
  // 한 번이라도 화면에 들어온 게이지 슬라이드. 처음 들어올 때만 호가 차오릅니다.
  const [revealedSlides, setRevealedSlides] = useState<ReadonlySet<string>>(() => new Set());
  const [carouselIndex, setCarouselIndex] = useState(1);
  const [infoSlideWidth, setInfoSlideWidth] = useState(windowWidth);
  const infoGaugeSize = infoSlideWidth < 290 ? 106 : infoSlideWidth < 350 ? 114 : 120;
  const infoSlideHeight = Math.max(146, infoGaugeSize + 34);
  const now = new Date();
  // 오늘 이미 지난 시간(실측)을 앞에 붙여 '오늘' 칸에서 00시부터 볼 수 있게 합니다. 지금 시각부터는 원래 예보 목록을 씁니다.
  const pastToday = weatherTodayPastItems.filter((item) => (
    (item.date || item.measuredAt?.slice(0, 10)) === todayDateLabel
    && Number((item.hour || item.measuredAt?.slice(11, 13) || '99').slice(0, 2)) < now.getHours()
  ));
  const hourlyForecastItems = [...pastToday, ...weatherHourlyItems]
    .map((item, index) => {
      const itemDate = item.date || item.measuredAt?.slice(0, 10) || '';
      const itemTime = item.hour?.slice(0, 5) || item.measuredAt?.slice(11, 16) || '--:--';
      const isCurrent = itemDate === todayDateLabel && Number(itemTime.slice(0, 2)) === now.getHours();
      const rainProbability = toNumber(item.rain_probability);
      const visualKind = getWeatherVisualKind(item.label);
      return {
        date: itemDate,
        hour: itemTime,
        isCurrent,
        isPast: index < pastToday.length,
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
  const [selectedForecastDate, setSelectedForecastDate] = useState<string | null>(null);
  const forecastDays = Array.from({ length: 4 }, (_, index) => {
    const day = addDays(new Date(`${todayDateLabel}T12:00:00`), index);
    const date = toIsoDate(day);
    const items = bannerForecastItems.filter((item) => item.date === date);
    const summary = items.reduce((best, item) => Math.abs(Number(item.hour.slice(0, 2)) - 12) < Math.abs(Number(best.hour.slice(0, 2)) - 12) ? item : best, items[0]);
    const temperatures = items.map((item) => item.temperature).filter((value): value is number => value !== undefined);
    // 오늘만 '오늘', 나머지는 날짜로 적습니다(예: 31일(토)).
    return { date, items, label: index === 0 ? '오늘' : `${day.getDate()}일(${weekdayLabels[day.getDay()]})`, summary, temperatures };
  });
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
      setSelectedForecastDate(null);
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
      if (infoSlideCount < 2 || Date.now() < pauseCarouselUntil.current) return;
      const next = Math.min(carouselIndexRef.current + 1, infoSlideCount + 1);
      carouselIndexRef.current = next;
      setCarouselIndex(next);
      setActiveInfoSlide((next - 1) % infoSlideCount);
      infoCarouselRef.current?.scrollTo({ animated: true, x: next * infoSlideWidth });
      if (next === infoSlideCount + 1) {
        if (carouselResetTimer.current) clearTimeout(carouselResetTimer.current);
        carouselResetTimer.current = setTimeout(() => {
          infoCarouselRef.current?.scrollTo({ animated: false, x: infoSlideWidth });
          carouselIndexRef.current = 1;
          setCarouselIndex(1);
          setActiveInfoSlide(0);
        }, 650);
      }
    }, 5000);
    return () => {
      clearInterval(timer);
      if (carouselResetTimer.current) clearTimeout(carouselResetTimer.current);
    };
  }, [infoSlideCount, infoSlideWidth]);
  useEffect(() => {
    infoCarouselRef.current?.scrollTo({ animated: false, x: carouselIndexRef.current * infoSlideWidth });
  }, [infoSlideWidth]);
  const nowHour = now.getHours();
  const bestOutingText = bestOutingWindow ? bestOutingWindowText(bestOutingWindow) : null;
  const hasHourlyForecast = bannerForecastItems.length > 0;
  // 배너 배경과 날씨 효과도 고른 시간의 날씨를 따라갑니다.
  const bannerWeatherLabel = peekForecast ? peekForecast.label : weather?.label;
  const weatherVisualKind = getWeatherVisualKind(bannerWeatherLabel);
  const weatherMotionKind = getHomeWeatherMotionKind(bannerWeatherLabel, peekForecast ? peekForecast.windSpeed : weather?.windSpeed);
  const weatherBackgroundKind = weatherMotionKind === 'wind' ? 'cloudy' : weatherVisualKind;
  // 시간별 예보 줄: 칸을 누르면 그 시간을 고릅니다. 줄은 원래대로 맨 왼쪽부터 시작합니다.
  const shownForecastIndex = selectedForecastIndex >= 0 ? selectedForecastIndex : nowForecastIndex;
  const selectForecastIndex = (index: number) => {
    const item = bannerForecastItems[index];
    if (!item || index === shownForecastIndex) return;
    setSelectedForecastKey(index === nowForecastIndex ? null : item.key);
    Haptics.selectionAsync().catch(() => {});
  };

  if (loading) return <HomeBannerSkeleton bannerHeight={infoSlideHeight + 12} reduceMotion={reduceMotion} />;
  return (
    <Animated.View
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        if (width > 0 && Math.abs(width - infoSlideWidth) > 1) setInfoSlideWidth(width);
      }}
      style={[styles.homeHeroBanner, { opacity: bannerOpacity }]}
    >
      <View style={styles.homeHeroBannerImage}>
        <View style={styles.homeHeroBannerBottom}>
          <View ref={tutorialTarget('homeBanner')} style={[styles.homeGaugeFeature, { backgroundColor: HOME_METRIC_BACKGROUND_COLORS[weatherBackgroundKind] }]}>
            <HomeBannerScene animate={!reduceMotion} precipitation={{ mm: peekForecast ? peekForecast.rainMm : weather?.rainMm, windSpeed: toNumber(peekForecast ? peekForecast.windSpeed : weather?.windSpeed) }} scene={{ background: weatherBackgroundKind, motion: weatherMotionKind }} />
          <View style={[styles.homeInfoCarouselViewport, { height: infoSlideHeight }]}>
            <ScrollView
              ref={infoCarouselRef}
              contentOffset={{ x: infoSlideWidth, y: 0 }}
              horizontal
              pagingEnabled
              onTouchStart={() => {
                pauseCarouselUntil.current = Date.now() + 15000;
              }}
              style={[styles.homeInfoCarousel, { height: infoSlideHeight, width: infoSlideWidth }]}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const next = Math.round(event.nativeEvent.contentOffset.x / infoSlideWidth);
                if (carouselResetTimer.current) clearTimeout(carouselResetTimer.current);
                if (next === 0) {
                  infoCarouselRef.current?.scrollTo({ animated: false, x: infoSlideCount * infoSlideWidth });
                  carouselIndexRef.current = infoSlideCount;
                  setCarouselIndex(infoSlideCount);
                  setActiveInfoSlide(infoSlideCount - 1);
                  return;
                }
                if (next === infoSlideCount + 1) {
                  infoCarouselRef.current?.scrollTo({ animated: false, x: infoSlideWidth });
                  carouselIndexRef.current = 1;
                  setCarouselIndex(1);
                  setActiveInfoSlide(0);
                  return;
                }
                carouselIndexRef.current = next;
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
          <View ref={tutorialTarget('homeHourly')} style={styles.homeHeroBannerForecastSection}>
            {hasHourlyForecast ? (
              <>
                <View style={styles.homeForecastDayRow}>
                  {forecastDays.map((day) => {
                    const expanded = selectedForecastDate === day.date;
                    const minimum = day.temperatures.length ? Math.round(Math.min(...day.temperatures)) : null;
                    const maximum = day.temperatures.length ? Math.round(Math.max(...day.temperatures)) : null;
                    return (
                      <Pressable
                        accessibilityLabel={`${day.label}, ${day.date}, ${day.summary?.label ?? '예보 없음'}`}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        key={day.date}
                        onPress={() => {
                          // 날짜를 바꾸거나 접으면 배너도 "지금"으로 돌립니다. 안 보이는 시각이 배너에 남지 않게.
                          setSelectedForecastKey(null);
                          setSelectedForecastDate(expanded ? null : day.date);
                        }}
                        style={[styles.homeForecastDay, expanded && styles.homeForecastDaySelected]}
                      >
                        <Text numberOfLines={1} style={[styles.homeForecastDayTitle, expanded && styles.homeHeroBannerForecastTimeCurrent]}>{day.label}</Text>
                        {day.summary ? <WeatherIcon kind={weatherIconKind(day.summary.label)} size={23} /> : <Ionicons color="#7890AE" name="time-outline" size={23} />}
                        <Text numberOfLines={1} style={styles.homeForecastDayTemp}>{minimum === null ? '예보 없음' : `${minimum}° / ${maximum}°`}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {selectedForecastDate && (() => {
                  const dayItems = bannerForecastItems
                    .map((item, index) => ({ ...item, index }))
                    .filter((item) => item.date === selectedForecastDate);
                  if (!dayItems.length) return <Text style={styles.homeHeroBannerForecastEmptyText}>이 날짜의 시간별 예보가 아직 없어요.</Text>;
                  return (
                    <HomeForecastHourStrip
                      dayKey={selectedForecastDate}
                      items={dayItems}
                      onSelect={selectForecastIndex}
                      selectedIndex={shownForecastIndex}
                      startIndex={Math.max(0, dayItems.findIndex((item) => item.isCurrent))}
                    />
                  );
                })()}
              </>
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
  );
}
