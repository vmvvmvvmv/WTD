import { AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { ScrollView, useWindowDimensions } from 'react-native';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { DETAIL_DATA_ENABLED } from '../../config/features';
import { styles } from '../../styles/appStyles';
import { bauhausColors, textColors } from '../../theme/bauhaus';
import type { CalendarEvent, HourlyDustItem, OutfitFigure, OutfitSensitivity, PastDustItem, PredictionResponse, WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/dust';
import { toNumber } from '../../utils/dust';
import { ACTIVITY_WEATHER_ICONS, activityForecastColor } from '../../features/dashboard/activityWeatherIcons';
import { bestOutingWindowText, findBestOutingWindow } from '../../features/dashboard/bestOutingWindow';
import { buildHomeActivityGuideItems } from '../../features/dashboard/homeActivityGuidePresenter';
import { buildHomeMetricSlides } from '../../features/dashboard/homeMetricPresenter';
import { buildCalendarRiskByEvent, type CalendarLocationForecast } from '../calendar/calendarForecast';
import { getWeatherVisualKind, type WeatherVisualKind } from '../../utils/weather';
import { isDateInEventRange } from '../calendar/calendarUtils';
import { confirmCalendarEventRemoval } from '../calendar/confirmCalendarEventRemoval';
import { AppActionIcon, type AppActionIconName } from '../shared/AppActionIcon';
import { WeatherIcon, weatherIconKind } from '../shared/WeatherIcon';
import { OutfitCardContainer, type OutfitFallbackLocation } from '../outfit/OutfitCard';

type HomeCircularGaugeProps = {
  gaugeSize?: number;
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
const HOME_PRECIPITATION_HORIZONTAL_DRIFT = Math.round(
  HOME_PRECIPITATION_LAYER_HEIGHT * Math.tan(Math.PI / 6),
);

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
  const diagonalDistance = fall.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -HOME_PRECIPITATION_HORIZONTAL_DRIFT],
  });
  const swayDistance = sway.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });

  return (
    <>
      {[0, 1].map((layerIndex) => {
        const layerOffsetX = layerIndex === 0 ? HOME_PRECIPITATION_HORIZONTAL_DRIFT : 0;
        const diagonalTranslateX = Animated.add(diagonalDistance, layerOffsetX);
        const translateX = kind === 'snow'
          ? Animated.add(diagonalTranslateX, swayDistance)
          : diagonalTranslateX;

        return (
          <Animated.Image
            key={layerIndex}
            resizeMode="cover"
            source={HOME_PRECIPITATION_OVERLAYS[kind]}
            style={[
              styles.homeFallingWeatherLayer,
              {
                opacity: kind === 'rain' ? 0.44 : 0.4,
                transform: [
                  { translateX },
                  { translateY: Animated.add(fallDistance, layerIndex === 0 ? -HOME_PRECIPITATION_LAYER_HEIGHT : 0) },
                ],
              },
            ]}
          />
        );
      })}
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

// 배경 이미지의 해 위치(왼쪽 위)에 맞춘 햇살 크기입니다.
const HOME_SUN_GLOW_SIZE = 150;
const HOME_SUN_RAY_SIZE = 280;
const HOME_SUN_RAY_PATHS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index * 30 * Math.PI) / 180;
  const spread = (index % 2 === 0 ? 4 : 2.5) * (Math.PI / 180);
  const point = (theta: number) => `${(100 * Math.cos(theta)).toFixed(1)},${(100 * Math.sin(theta)).toFixed(1)}`;
  return `M0,0 L${point(angle - spread)} L${point(angle + spread)} Z`;
});

function useLoopingValue(duration: number, mode: 'pingpong' | 'forward') {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const timing = (toValue: number) => Animated.timing(value, {
      duration,
      easing: mode === 'pingpong' ? Easing.inOut(Easing.sin) : Easing.linear,
      toValue,
      useNativeDriver: true,
    });
    const animation = Animated.loop(mode === 'pingpong' ? Animated.sequence([timing(1), timing(0)]) : timing(1));
    animation.start();
    return () => animation.stop();
  }, [duration, mode, value]);
  return value;
}

// 맑은 날: 해 주변 빛이 천천히 숨 쉬듯 커졌다 작아지고, 햇살이 아주 느리게 돕니다.
function HomeClearSkyOverlay() {
  const pulse = useLoopingValue(2200, 'pingpong');
  const spin = useLoopingValue(36000, 'forward');
  return (
    <>
      <Animated.View
        style={[
          styles.homeSunLayer,
          { height: HOME_SUN_RAY_SIZE, marginLeft: -HOME_SUN_RAY_SIZE / 2, marginTop: -HOME_SUN_RAY_SIZE / 2, width: HOME_SUN_RAY_SIZE },
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.95] }),
            transform: [
              { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) },
            ],
          },
        ]}
      >
        <Svg height="100%" viewBox="-100 -100 200 200" width="100%">
          <Defs>
            <RadialGradient cx="0" cy="0" gradientUnits="userSpaceOnUse" id="homeSunRay" r="100">
              <Stop offset="0" stopColor="#FFF4CC" stopOpacity="0.4" />
              <Stop offset="1" stopColor="#FFF4CC" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          {HOME_SUN_RAY_PATHS.map((path) => <Path d={path} fill="url(#homeSunRay)" key={path} />)}
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          styles.homeSunLayer,
          { height: HOME_SUN_GLOW_SIZE, marginLeft: -HOME_SUN_GLOW_SIZE / 2, marginTop: -HOME_SUN_GLOW_SIZE / 2, width: HOME_SUN_GLOW_SIZE },
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.2] }) }],
          },
        ]}
      >
        <Svg height="100%" viewBox="-100 -100 200 200" width="100%">
          <Defs>
            <RadialGradient cx="0" cy="0" gradientUnits="userSpaceOnUse" id="homeSunGlow" r="100">
              <Stop offset="0" stopColor="#FFF8DC" stopOpacity="0.75" />
              <Stop offset="0.35" stopColor="#FFE9A8" stopOpacity="0.28" />
              <Stop offset="1" stopColor="#FFE9A8" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="0" cy="0" fill="url(#homeSunGlow)" r="100" />
        </Svg>
      </Animated.View>
      {HOME_SKY_GLINTS.map((glint) => <HomeSkyGlint key={`${glint.left}-${glint.top}`} {...glint} />)}
      <HomeWindCloud delayMs={0} duration={16000} height={70} opacity={0.2} source={HOME_WIND_CLOUDS.small} top={18} width={140} />
      <HomeWindCloud delayMs={7000} duration={21000} height={96} opacity={0.14} source={HOME_WIND_CLOUDS.large} top={92} width={180} />
    </>
  );
}

// 맑은 하늘에서 반짝이는 작은 빛 조각입니다. 위치와 시작 시점을 엇갈려 동시에 깜빡이지 않게 합니다.
const HOME_SKY_GLINTS = [
  { delayMs: 0, left: '32%', size: 7, top: '12%' },
  { delayMs: 900, left: '48%', size: 5, top: '30%' },
  { delayMs: 1700, left: '24%', size: 6, top: '44%' },
  { delayMs: 2500, left: '62%', size: 4, top: '16%' },
] as const;

function HomeSkyGlint({ delayMs, left, size, top }: { delayMs: number; left: `${number}%`; size: number; top: `${number}%` }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(delayMs),
      Animated.timing(progress, { duration: 700, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }),
      Animated.timing(progress, { duration: 900, easing: Easing.in(Easing.quad), toValue: 0, useNativeDriver: true }),
      Animated.delay(3200 - delayMs),
    ]));
    animation.start();
    return () => animation.stop();
  }, [delayMs, progress]);
  return (
    <Animated.View
      style={[
        styles.homeSkyGlint,
        {
          borderRadius: size,
          height: size,
          left,
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
          top,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [4, -4] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.4] }) },
          ],
          width: size,
        },
      ]}
    />
  );
}

// 흐린 날: 구름이 바람 부는 날보다 훨씬 느리게 흘러갑니다.
function HomeCloudDriftOverlay() {
  return (
    <>
      <HomeWindCloud delayMs={0} duration={13000} height={110} opacity={0.28} source={HOME_WIND_CLOUDS.large} top={-10} width={200} />
      <HomeWindCloud delayMs={4000} duration={17000} height={84} opacity={0.22} source={HOME_WIND_CLOUDS.small} top={70} width={160} />
      <HomeWindCloud delayMs={8500} duration={15000} height={70} opacity={0.18} source={HOME_WIND_CLOUDS.large} top={34} width={130} />
    </>
  );
}

// 날씨가 바뀌거나 화면이 처음 열릴 때 효과가 갑자기 튀어나오지 않도록 서서히 보여줍니다.
function HomeMotionLayer({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(opacity, { duration: 900, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>{children}</Animated.View>;
}

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);
  return reduceMotion;
}

function HomeCircularGauge({ gaugeSize, large = false, progress, tone, unit, value }: HomeCircularGaugeProps) {
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
        <HomeCircularGauge gaugeSize={gaugeSize} large progress={progress} tone={tone} unit={unit} value={value} />
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
  onDeleteCalendarEvent,
  onDeleteFollowingCalendarEvents,
  onOpenCalendar,
  onOpenDetail,
  onOpenMap,
  outfitEnabled,
  outfitFallbackLocation,
  outfitFigure,
  outfitSensitivity,
  mapPreviewUrl,
  hourlyItems,
  pastItems,
  loadFailed = false,
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
  onDeleteCalendarEvent?: (eventId: string) => void;
  onDeleteFollowingCalendarEvents?: (event: CalendarEvent) => void;
  onOpenCalendar?: () => void;
  onOpenDetail: () => void;
  onOpenMap: () => void;
  outfitEnabled: boolean;
  outfitFallbackLocation?: OutfitFallbackLocation;
  outfitFigure: OutfitFigure;
  outfitSensitivity: OutfitSensitivity;
  mapPreviewUrl: string;
  hourlyItems: HourlyDustItem[];
  pastItems: PastDustItem[];
  // 서버에 연결하지 못해 보여줄 데이터가 없는 상태입니다. 단순히 아직 불러오는 중인 것과 구분합니다.
  loadFailed?: boolean;
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
  const infoSlides = useMemo(() => buildHomeMetricSlides({
    currentO3,
    currentPm10,
    currentPm25,
    gaugeSize: infoGaugeSize,
    pastItems,
    todayDateLabel,
    weather,
    yesterdayWeather,
  }).map((slide) => (loadFailed && (slide.value === '-' || slide.value === '--')
    ? { ...slide, comparison: '연결되면 다시 보여드려요', status: '연결 안 됨' }
    : slide)), [currentO3, currentPm10, currentPm25, infoGaugeSize, loadFailed, pastItems, todayDateLabel, weather, yesterdayWeather]);
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
      const rainProbability = toNumber(item.rain_probability);
      const visualKind = getWeatherVisualKind(item.label);
      return {
        isCurrent,
        // 비·눈이 예보됐거나 강수확률 60% 이상인 시간은 파란색으로 강조합니다.
        isRainy: visualKind === 'rain' || visualKind === 'snow' || (rainProbability ?? 0) >= 60 || (toNumber(item.rain_mm) ?? 0) > 0,
        key: `${itemDate || item.measuredAt || 'hour'}-${item.hour || index}`,
        label: item.label || '날씨 확인 중',
        rainProbability,
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
  const nowHour = now.getHours();
  const bestOutingWindow = useMemo(() => findBestOutingWindow({
    dustItems: hourlyItems,
    fallbackPm10: currentPm10,
    nowHour,
    todayDateLabel,
    weatherItems: weatherHourlyItems,
  }), [currentPm10, hourlyItems, nowHour, todayDateLabel, weatherHourlyItems]);
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
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
  }), [currentPm10, eventLocationForecasts, hourlyItems, prediction, todayCalendarEvents, todayDateLabel, weather, weatherHourlyItems, weatherMidTermItems]);
  const weatherVisualKind = getWeatherVisualKind(weather?.label);
  const weatherMotionKind = getHomeWeatherMotionKind(weather?.label, weather?.windSpeed);
  const reduceMotion = useReduceMotion();
  const weatherBackgroundKind = weatherMotionKind === 'wind' ? 'cloudy' : weatherVisualKind;
  const currentTimeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const activityGuideRows = useMemo(
    () => buildHomeActivityGuideItems(todayCalendarEvents, activityGuideRiskByEvent, todayDateLabel, currentTimeLabel),
    [activityGuideRiskByEvent, currentTimeLabel, todayCalendarEvents, todayDateLabel],
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
              {!reduceMotion && (
                <HomeMotionLayer key={weatherMotionKind}>
                  {(weatherMotionKind === 'rain' || weatherMotionKind === 'snow') && (
                    <HomeFallingWeatherOverlay kind={weatherMotionKind} />
                  )}
                  {weatherMotionKind === 'wind' && <HomeWindOverlay />}
                  {weatherMotionKind === 'clear' && <HomeClearSkyOverlay />}
                  {weatherMotionKind === 'cloudy' && <HomeCloudDriftOverlay />}
                </HomeMotionLayer>
              )}
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
                      <WeatherIcon kind={weatherIconKind(item.label)} size={23} />
                      <Text style={styles.homeHeroBannerForecastTemp}>
                        {item.temperature === undefined ? '-' : `${Math.round(item.temperature)}°`}
                      </Text>
                      <Text style={[styles.homeHeroBannerForecastRain, item.isRainy && styles.homeHeroBannerForecastRainActive]}>
                        {item.rainProbability === undefined ? '강수 -' : `강수 ${Math.round(item.rainProbability)}%`}
                      </Text>
                    </View>
                  ))}
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
                  <Ionicons color={bestOutingText ? bauhausColors.blue : textColors.muted} name="walk-outline" size={17} />
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
            {activityGuideRows.length === 0 && <Text style={styles.activityGuideEmptyText}>오늘 등록된 일정이 없어요</Text>}
          </View>
          {activityGuideRows.length === 0 ? (
            <Pressable
              accessibilityLabel="일정 추가하러 가기"
              accessibilityRole="button"
              onPress={onOpenCalendar}
              style={({ pressed }) => [styles.activityGuideAddChip, pressed && styles.pressedFeedback]}
            >
              <Ionicons color={accentTone} name="add" size={17} />
              <Text style={[styles.activityGuideAddChipText, { color: accentTone }]}>일정 추가</Text>
            </Pressable>
          ) : (
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
        {activityGuideRows.length > 0 && <Pressable
          accessibilityLabel={"\uC77C\uC815 \uCD94\uAC00\uD558\uB7EC \uAC00\uAE30"}
          onPress={onOpenCalendar}
          style={({ pressed }) => [styles.activityGuideAddScheduleButton, pressed && styles.pressedFeedback]}
        >
          <View style={styles.activityGuideAddScheduleIcon}>
            <AppActionIcon name="schedule" size={27} />
          </View>
          <Text style={[styles.activityGuideAddScheduleText, { color: accentTone }]}>{"\uC77C\uC815 \uCD94\uAC00\uD558\uB7EC \uAC00\uAE30"}</Text>
          <Ionicons color={accentTone} name="chevron-forward" size={16} />
        </Pressable>}
      </View>
      {outfitEnabled && <View style={styles.homeOutfitSection}>
        <View style={styles.homeOutfitSectionHeader}>
          <View style={styles.homeOutfitSectionTitleGroup}>
            <Text style={styles.homeOutfitSectionTitle}>오늘 옷차림</Text>
            <Text numberOfLines={1} style={styles.homeOutfitSectionMeta}>
              {`지금부터 ${dayOutfitEvents[0].endTime === '23:59' ? '자정' : '밤 10시'}까지 날씨를 반영했어요`}
            </Text>
          </View>
          <View style={styles.homeOutfitHeaderIcon}>
            <HomeMotionActionIcon name="outfit" size={25} />
          </View>
        </View>
        <OutfitCardContainer enabled={outfitEnabled} enhanceWithLlm events={dayOutfitEvents} fallbackLocation={outfitFallbackLocation} figure={outfitFigure} sensitivity={outfitSensitivity} showBothFigures />
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
          <View style={styles.homeMapPreviewIconButton}>
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

