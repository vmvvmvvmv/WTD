import { Animated, Easing, Image, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DETAIL_DATA_ENABLED } from '../../config/features';
import { styles } from '../../styles/appStyles';
import type { CalendarEvent, HourlyDustItem, OutfitSensitivity, PastDustItem, PredictionResponse, WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/dust';
import { toNumber } from '../../utils/dust';
import { buildHomeActivityGuideItems } from '../../features/dashboard/homeActivityGuidePresenter';
import { buildHomeMetricSlides } from '../../features/dashboard/homeMetricPresenter';
import { buildCalendarRiskByEvent, type CalendarLocationForecast } from '../calendar/calendarForecast';
import { getWeatherIcon, getWeatherVisualKind, type WeatherVisualKind } from '../../utils/weather';
import { isDateInEventRange } from '../calendar/calendarUtils';
import { AppActionIcon, type AppActionIconName } from '../shared/AppActionIcon';
import { OutfitCardContainer } from '../outfit/OutfitCard';

type HomeCircularGaugeProps = {
  gaugeSize?: number;
  label: string;
  large?: boolean;
  progress: number;
  tone: string;
  unit: string;
  value: string;
};

type HomeWeatherMotionKind = WeatherVisualKind | 'wind';

const HOME_METRIC_BACKGROUNDS = {
  clear: require('../../../assets/home-metric-clear-v3.png'),
  cloudy: require('../../../assets/home-metric-cloudy-v1.png'),
  rain: require('../../../assets/home-metric-rain-v1.png'),
  snow: require('../../../assets/home-metric-snow-v1.png'),
} as const;

const HOME_METRIC_BACKGROUND_COLORS: Record<WeatherVisualKind, string> = {
  clear: '#1066D1',
  cloudy: '#26579C',
  rain: '#084BAD',
  snow: '#4484DA',
};

const HOME_PRECIPITATION_OVERLAYS = {
  rain: require('../../../assets/home-rain-overlay-v1.png'),
  snow: require('../../../assets/home-snow-overlay-v1.png'),
} as const;

const HOME_WIND_CLOUDS = {
  large: require('../../../assets/home-wind-cloud-large-v1.png'),
  small: require('../../../assets/home-wind-cloud-small-v1.png'),
} as const;

const HOME_WIND_STREAK_OVERLAY = require('../../../assets/home-wind-streak-overlay-v2.png');

const HOME_PRECIPITATION_LAYER_HEIGHT = 260;

function getHomeWeatherMotionKind(label?: string | null, windSpeed?: number | string | null): HomeWeatherMotionKind {
  const weatherKind = getWeatherVisualKind(label ?? undefined);
  if (weatherKind === 'rain' || weatherKind === 'snow') return weatherKind;
  const numericWindSpeed = toNumber(windSpeed);
  if (numericWindSpeed !== undefined && numericWindSpeed >= 8) return 'wind';
  return weatherKind;
}

function HomeMotionActionIcon({ delayMs = 0, name, size }: { delayMs?: number; name: AppActionIconName; size: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const motion = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(progress, {
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    motion.start();
    return () => motion.stop();
  }, [delayMs, progress]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -2.5] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) },
        ],
      }}
    >
      <AppActionIcon name={name} size={size} />
    </Animated.View>
  );
}

function HomeFallingWeatherOverlay({ kind }: { kind: 'rain' | 'snow' }) {
  const fall = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    fall.setValue(0);
    sway.setValue(-1);
    const fallAnimation = Animated.loop(
      Animated.timing(fall, {
        duration: kind === 'rain' ? 850 : 5600,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    const swayAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, {
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          toValue: -1,
          useNativeDriver: true,
        }),
      ]),
    );
    fallAnimation.start();
    if (kind === 'snow') swayAnimation.start();
    return () => {
      fallAnimation.stop();
      swayAnimation.stop();
    };
  }, [fall, kind, sway]);

  const fallDistance = fall.interpolate({
    inputRange: [0, 1],
    outputRange: [0, HOME_PRECIPITATION_LAYER_HEIGHT],
  });
  const swayDistance = sway.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });

  return (
    <>
      {[0, 1].map((layerIndex) => (
        <Animated.Image
          key={layerIndex}
          resizeMode="cover"
          source={HOME_PRECIPITATION_OVERLAYS[kind]}
          style={[
            styles.homeFallingWeatherLayer,
            {
              opacity: kind === 'rain' ? 0.44 : 0.4,
              transform: [
                { translateX: kind === 'snow' ? swayDistance : 0 },
                { translateY: Animated.add(fallDistance, layerIndex === 0 ? -HOME_PRECIPITATION_LAYER_HEIGHT : 0) },
              ],
            },
          ]}
        />
      ))}
    </>
  );
}

function HomeWindCloud({
  delayMs,
  duration,
  height,
  opacity,
  source,
  top,
  width,
}: {
  delayMs: number;
  duration: number;
  height: number;
  opacity: number;
  source: number;
  top: number;
  width: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(delayMs),
      Animated.loop(
        Animated.timing(progress, {
          duration,
          easing: Easing.linear,
          toValue: 1,
          useNativeDriver: true,
        }),
      ),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delayMs, duration, progress]);

  return (
    <Animated.Image
      resizeMode="contain"
      source={source}
      style={[
        styles.homeWindCloud,
        {
          height,
          opacity,
          top,
          width,
          transform: [{
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [screenWidth + 20, -width - 20],
            }),
          }],
        },
      ]}
    />
  );
}

function HomeWindStreaks() {
  const progress = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        duration: 1400,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const travel = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -screenWidth],
  });

  return (
    <>
      {[0, 1].map((layerIndex) => (
        <Animated.Image
          key={layerIndex}
          resizeMode="cover"
          source={HOME_WIND_STREAK_OVERLAY}
          style={[
            styles.homeWindStreakLayer,
            {
              width: screenWidth,
              transform: [{ translateX: Animated.add(travel, layerIndex * screenWidth) }],
            },
          ]}
        />
      ))}
    </>
  );
}

function HomeWindOverlay() {
  return (
    <>
      <HomeWindStreaks />
      <HomeWindCloud delayMs={0} duration={5600} height={116} opacity={0.42} source={HOME_WIND_CLOUDS.large} top={-18} width={206} />
      <HomeWindCloud delayMs={1700} duration={6900} height={92} opacity={0.3} source={HOME_WIND_CLOUDS.small} top={78} width={174} />
      <HomeWindCloud delayMs={3500} duration={6200} height={74} opacity={0.24} source={HOME_WIND_CLOUDS.large} top={42} width={132} />
    </>
  );
}

function HomeCircularGauge({ gaugeSize, label, large = false, progress, tone, unit, value }: HomeCircularGaugeProps) {
  const size = gaugeSize ?? (large ? 132 : 62);
  const stroke = large ? 10 : 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * 0.78;
  const safeProgress = Math.max(0.04, Math.min(1, progress));
  return (
    <View style={styles.homeCircularGauge}>
      <View style={[styles.homeCircularGaugeCircle, large && styles.homeCircularGaugeCircleLarge, { height: size, width: size }]}>
        <Svg height={size} width={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="rgba(255,255,255,0.34)"
            strokeDasharray={`${arc} ${circumference}`}
            strokeLinecap="round"
            strokeWidth={stroke}
            transform={`rotate(130 ${size / 2} ${size / 2})`}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="#ffffff"
            strokeDasharray={`${arc * safeProgress} ${circumference}`}
            strokeLinecap="round"
            strokeWidth={stroke}
            transform={`rotate(130 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.homeCircularGaugeCenter}>
          <Text style={[styles.homeCircularGaugeLabel, large && styles.homeCircularGaugeLabelLarge]}>{label}</Text>
          <Text style={[styles.homeCircularGaugeValue, large && styles.homeCircularGaugeValueLarge]}>{value}</Text>
          <Text style={[styles.homeCircularGaugeUnit, large && styles.homeCircularGaugeUnitLarge]}>{unit}</Text>
        </View>
      </View>
    </View>
  );
}

function HomeInfoGaugeSlide({ comparison, gaugeSize, label, progress, slideHeight, status, title, tone, unit, value, width }: {
  comparison: string;
  gaugeSize: number;
  label: string;
  progress: number;
  slideHeight: number;
  status: string;
  title: string;
  tone: string;
  unit: string;
  value: string;
  width: number;
}) {
  return (
    <View style={[styles.homeInfoSlide, styles.homeSplitGaugeSlide, { height: slideHeight, width }]}>
      <View style={[styles.homeSplitGaugeVisual, { width: gaugeSize + 4 }]}>
        <HomeCircularGauge gaugeSize={gaugeSize} large label={label} progress={progress} tone={tone} unit={unit} value={value} />
      </View>
      <View style={styles.homeSplitGaugeInfo}>
        <Text numberOfLines={2} style={styles.homeInfoSlideTitle}>{title}</Text>
        <View style={styles.homeSplitGaugeStatusRow}>
          <View style={[styles.homeSplitGaugeStatusDot, { backgroundColor: tone }]} />
          <Text style={styles.homeSplitGaugeStatus}>{status}</Text>
        </View>
        <Text numberOfLines={2} style={styles.homeInfoSlideComparison}>{comparison}</Text>
      </View>
    </View>
  );
}



// 홈 탭의 현재 미세먼지 상태, 주요 오염물질 카드, 최근/예측 흐름을 보여줍니다.
export function HomePanel({
  currentPm10,
  currentPm25,
  currentO3,
  accentSoftTone,
  accentTone,
  calendarEvents,
  eventLocationForecasts,
  onOpenCalendar,
  onOpenDetail,
  onOpenMap,
  outfitEnabled,
  outfitSensitivity,
  mapPreviewUrl,
  hourlyItems,
  pastItems,
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
  accentSoftTone: string;
  accentTone: string;
  calendarEvents?: CalendarEvent[];
  eventLocationForecasts?: Record<string, CalendarLocationForecast>;
  onOpenCalendar?: () => void;
  onOpenDetail: () => void;
  onOpenMap: () => void;
  outfitEnabled: boolean;
  outfitSensitivity: OutfitSensitivity;
  mapPreviewUrl: string;
  hourlyItems: HourlyDustItem[];
  pastItems: PastDustItem[];
  weatherHourlyItems: WeatherHourlyItem[];
  weatherMidTermItems?: WeatherMidTermItem[];
  prediction: PredictionResponse | null;
  todayDateLabel: string;
  weather?: WeatherState | null;
  yesterdayWeather?: WeatherState | null;
}) {
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const infoCarouselRef = useRef<ScrollView>(null);
  const [activeInfoSlide, setActiveInfoSlide] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(1);
  const [mapPreviewFailed, setMapPreviewFailed] = useState(false);
  const [selectedOutfitEventId, setSelectedOutfitEventId] = useState<string | null>(null);
  const infoSlideWidth = windowWidth;
  const infoSlideHeight = Math.max(146, Math.ceil(146 * fontScale));
  const infoGaugeSize = infoSlideWidth < 290 ? 106 : infoSlideWidth < 350 ? 114 : 120;
  useEffect(() => {
    setMapPreviewFailed(false);
  }, [mapPreviewUrl]);
  const infoSlides = useMemo(() => buildHomeMetricSlides({
    currentO3,
    currentPm10,
    currentPm25,
    gaugeSize: infoGaugeSize,
    pastItems,
    todayDateLabel,
    weather,
    yesterdayWeather,
  }), [currentO3, currentPm10, currentPm25, infoGaugeSize, pastItems, todayDateLabel, weather, yesterdayWeather]);
  const infoSlideCount = infoSlides.length;
  const carouselSlides = [infoSlides[infoSlideCount - 1], ...infoSlides, infoSlides[0]];
  useEffect(() => {
    const timer = setInterval(() => {
      setCarouselIndex((current) => current + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    infoCarouselRef.current?.scrollTo({ animated: carouselIndex !== 1, x: carouselIndex * infoSlideWidth });
  }, [carouselIndex, infoSlideWidth]);
  const now = new Date();
  const hourlyForecastItems = weatherHourlyItems
    .map((item, index) => {
      const itemDate = item.date || item.measuredAt?.slice(0, 10) || '';
      const itemTime = item.hour?.slice(0, 5) || item.measuredAt?.slice(11, 16) || '--:--';
      const isCurrent = itemDate === todayDateLabel && Number(itemTime.slice(0, 2)) === now.getHours();
      return {
        isCurrent,
        key: `${itemDate || item.measuredAt || 'hour'}-${item.hour || index}`,
        label: item.label || '날씨 확인 중',
        rainProbability: toNumber(item.rain_probability),
        temperature: toNumber(item.temperature),
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
  const hasHourlyForecast = bannerForecastItems.length > 0;
  const todayCalendarEvents = useMemo(() => (calendarEvents ?? [])
    .filter((event) => isDateInEventRange(todayDateLabel, event))
    .sort((a, b) => a.time.localeCompare(b.time)), [calendarEvents, todayDateLabel]);
  const activityGuideRiskByEvent = useMemo(() => buildCalendarRiskByEvent(todayCalendarEvents, {
    currentPm10,
    eventLocationForecasts,
    hourlyItems,
    prediction,
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
  }), [currentPm10, eventLocationForecasts, hourlyItems, prediction, todayCalendarEvents, todayDateLabel, weather, weatherHourlyItems, weatherMidTermItems]);
  const weatherVisualKind = getWeatherVisualKind(weather?.label);
  const weatherMotionKind = getHomeWeatherMotionKind(weather?.label, weather?.windSpeed);
  const weatherBackgroundKind = weatherMotionKind === 'wind' ? 'cloudy' : weatherVisualKind;
  const activityGuideRows = useMemo(
    () => buildHomeActivityGuideItems(todayCalendarEvents, activityGuideRiskByEvent),
    [activityGuideRiskByEvent, todayCalendarEvents],
  );
  const currentTimeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const defaultOutfitEvent = todayCalendarEvents.find((event) => event.time >= currentTimeLabel) ?? todayCalendarEvents[0];
  const activeOutfitEvent = todayCalendarEvents.find((event) => event.id === selectedOutfitEventId) ?? defaultOutfitEvent;
  return (
    <View>
      <View style={styles.homeHeroBanner}>
        <View style={styles.homeHeroBannerImage}>
          <View style={styles.homeHeroBannerBottom}>
            <View style={[styles.homeGaugeFeature, { backgroundColor: HOME_METRIC_BACKGROUND_COLORS[weatherBackgroundKind] }]}>
              <Image
                resizeMode="cover"
                source={HOME_METRIC_BACKGROUNDS[weatherBackgroundKind]}
                style={styles.homeGaugeFeatureImage}
              />
              {(weatherMotionKind === 'rain' || weatherMotionKind === 'snow') && (
                <HomeFallingWeatherOverlay kind={weatherMotionKind} />
              )}
              {weatherMotionKind === 'wind' && <HomeWindOverlay />}
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
                  <HomeInfoGaugeSlide key={`${slide.label}-${index}`} {...slide} slideHeight={infoSlideHeight} width={infoSlideWidth} />
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
                  {bannerForecastItems.map((item) => (
                    <View
                      key={item.key}
                      style={[styles.homeHeroBannerForecastItem, item.isCurrent && styles.homeHeroBannerForecastItemCurrent]}
                    >
                      <Text style={[styles.homeHeroBannerForecastTime, item.isCurrent && styles.homeHeroBannerForecastTimeCurrent]}>{item.timeLabel}</Text>
                      <Ionicons color="#6A7FA8" name={getWeatherIcon(item.label)} size={21} />
                      <Text style={styles.homeHeroBannerForecastTemp}>
                        {item.temperature === undefined ? '-' : `${Math.round(item.temperature)}°`}
                      </Text>
                      <Text style={styles.homeHeroBannerForecastRain}>
                        {item.rainProbability === undefined ? '강수 -' : `강수 ${Math.round(item.rainProbability)}%`}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.homeHeroBannerForecastEmpty}>
                  <Ionicons color="#7890AE" name="time-outline" size={18} />
                  <Text style={styles.homeHeroBannerForecastEmptyText}>시간별 예보를 준비 중이에요</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.activityGuideCard,
          activityGuideRows.length === 0 && styles.activityGuideCardEmpty,
          { shadowColor: accentTone },
        ]}
      >
        <View style={styles.activityGuideHeader}>
          <View style={styles.activityGuideHeaderTitleGroup}>
            <Text style={styles.activityGuideTitle}>오늘 활동 가이드</Text>
          </View>
          {activityGuideRows.length > 0 && (
            <Pressable
              accessibilityLabel="캘린더 열기"
              onPress={onOpenCalendar}
              style={({ pressed }) => [
                styles.activityGuideEditButton,
                pressed && styles.pressedFeedback,
              ]}
            >
              <HomeMotionActionIcon name="schedule" size={25} />
            </Pressable>
          )}
        </View>
        <View style={[styles.activityGuideList, activityGuideRows.length === 0 && styles.activityGuideListEmpty]}>
          {activityGuideRows.length === 0 && (
            <View style={styles.activityGuideEmptyBox}>
              <Text style={styles.activityGuideRowTitle}>오늘 등록된 일정이 없어요</Text>
            </View>
          )}
          {activityGuideRows.map((item) => {
            const selected = activeOutfitEvent?.id === item.id;
            return (
              <View key={item.id} style={styles.activityGuideItemGroup}>
                <Pressable
                  accessibilityLabel={`${item.title} 옷차림 추천 보기`}
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedOutfitEventId(item.id)}
                  style={({ pressed }) => [styles.activityGuideRow, pressed && styles.pressedFeedback]}
                >
                  <View style={[styles.activityGuideIconBox, { backgroundColor: '#E8F1FE' }]}>
                    <AppActionIcon
                      name={item.activityType === 'indoor' ? 'activityIndoor' : item.activityType === 'transit' ? 'activityTransit' : 'activityOutdoor'}
                      size={34}
                    />
                  </View>
                  <View style={styles.activityGuideTextGroup}>
                    <View style={styles.activityGuideTitleRow}>
                      <Text numberOfLines={1} style={styles.activityGuideRowTitle}>{item.title}</Text>
                      <View style={[styles.activityGuideRiskBadge, { backgroundColor: item.riskSoftTone, borderColor: item.riskBorderTone }]}>
                        <View style={[styles.activityGuideRiskDot, { backgroundColor: item.riskTone }]} />
                        <Text style={[styles.activityGuideRiskBadgeText, { color: item.riskTone }]}>{item.riskLabel}</Text>
                      </View>
                    </View>
                    <View style={styles.activityGuideMetaRow}>
                      <Text style={styles.activityGuideTimeText}>{item.timeLabel}</Text>
                      {!!item.locationLabel && <><View style={styles.activityGuideMetaDivider} /><Text numberOfLines={1} style={styles.activityGuideRowLocation}>{item.locationLabel}</Text></>}
                    </View>
                    <Text numberOfLines={2} style={styles.activityGuideRowDesc}>{item.advice}</Text>
                  </View>
                  <Ionicons color={selected ? accentTone : '#8CA0BA'} name={selected ? 'checkmark-circle' : 'chevron-forward'} size={17} style={styles.activityGuideRowChevron} />
                </Pressable>
              </View>
            );
          })}
        </View>
        <Pressable
          accessibilityLabel={"\uC77C\uC815 \uCD94\uAC00\uD558\uB7EC \uAC00\uAE30"}
          onPress={onOpenCalendar}
          style={({ pressed }) => [
            styles.activityGuideAddScheduleButton,
            activityGuideRows.length === 0 && styles.activityGuideAddScheduleButtonEmpty,
            pressed && styles.pressedFeedback,
          ]}
        >
          <View style={styles.activityGuideAddScheduleIcon}>
            <AppActionIcon name="schedule" size={27} />
          </View>
          <Text style={[styles.activityGuideAddScheduleText, { color: accentTone }]}>{"\uC77C\uC815 \uCD94\uAC00\uD558\uB7EC \uAC00\uAE30"}</Text>
          <Ionicons color={accentTone} name="chevron-forward" size={16} />
        </Pressable>
      </View>
      {outfitEnabled && <View style={styles.homeOutfitSection}>
        <View style={styles.homeOutfitSectionHeader}>
          <View style={styles.homeOutfitSectionTitleGroup}>
            <Text style={styles.homeOutfitSectionTitle}>오늘 옷차림</Text>
            <Text numberOfLines={1} style={styles.homeOutfitSectionMeta}>
              {activeOutfitEvent ? `${activeOutfitEvent.time} · ${activeOutfitEvent.title}` : '일정 시간과 장소에 맞춰 추천해드려요'}
            </Text>
          </View>
          <Ionicons color={accentTone} name="shirt-outline" size={24} />
        </View>
        {activeOutfitEvent ? (
          <OutfitCardContainer enabled={outfitEnabled} event={activeOutfitEvent} sensitivity={outfitSensitivity} />
        ) : (
          <Pressable
            accessibilityLabel="옷차림 추천을 위한 일정 추가"
            onPress={onOpenCalendar}
            style={({ pressed }) => [styles.homeOutfitEmpty, pressed && styles.pressedFeedback]}
          >
            <Text style={styles.homeOutfitEmptyText}>일정을 등록하면 날씨와 대기질에 맞는 옷차림을 보여드려요.</Text>
            <Ionicons color={accentTone} name="chevron-forward" size={17} />
          </Pressable>
        )}
      </View>}
      <Pressable
        accessibilityLabel={"\uC804\uAD6D \uC9C0\uB3C4 \uB0A0\uC528 \uBCF4\uB7EC\uAC00\uAE30"}
        onPress={onOpenMap}
        style={({ pressed }) => [styles.homeMapPreviewCard, { shadowColor: accentTone }, pressed && styles.pressedFeedback]}
      >
        <View style={styles.homeMapPreviewHeader}>
          <View style={styles.homeMapPreviewTitleGroup}>
            <Text style={styles.homeMapPreviewTitle}>{"\uC804\uAD6D \uB0A0\uC528 \uC9C0\uB3C4"}</Text>
          </View>
          <View style={[styles.homeMapPreviewIconButton, { backgroundColor: accentSoftTone }]}>
            <HomeMotionActionIcon delayMs={420} name="map" size={29} />
          </View>
        </View>
        <View style={styles.homeMapPreviewFrame} pointerEvents="none">
          {mapPreviewFailed || !mapPreviewUrl ? (
            <View style={styles.homeMapPreviewFallback}>
              <AppActionIcon name="map" size={37} />
              <Text style={styles.homeMapPreviewFallbackText}>지도를 불러올 수 없어요</Text>
            </View>
          ) : (
            <WebView
              source={{ uri: mapPreviewUrl }}
              javaScriptEnabled
              domStorageEnabled
              androidLayerType="hardware"
              mixedContentMode="always"
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
      {DETAIL_DATA_ENABLED && (
      <Pressable
        accessibilityLabel="상세 데이터 보기"
        onPress={onOpenDetail}
        style={({ pressed }) => [styles.homeDetailDataButton, pressed && styles.pressedFeedback]}
      >
        <Text style={[styles.homeDetailDataButtonText, { color: accentTone }]}>상세 데이터 보기</Text>
        <Ionicons color={accentTone} name="chevron-forward" size={18} />
      </Pressable>
      )}
    </View>
  );
}

