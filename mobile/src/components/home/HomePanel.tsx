import { AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { ScrollView, useWindowDimensions } from 'react-native';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

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
import { getWeatherVisualKind, type WeatherVisualKind } from '../../utils/weather';
import { isDateInEventRange } from '../calendar/calendarUtils';
import { confirmCalendarEventRemoval } from '../calendar/confirmCalendarEventRemoval';
import { AppActionIcon, type AppActionIconName } from '../shared/AppActionIcon';
import { WeatherIcon, weatherIconKind } from '../shared/WeatherIcon';
import { HomeBannerSkeleton } from './HomeBannerSkeleton';
import { OutfitCardContainer, type OutfitFallbackLocation } from '../outfit/OutfitCard';
import { accentTone } from '../../theme/appTheme';

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

type HomeBannerSceneKind = { background: WeatherVisualKind; motion: HomeWeatherMotionKind };

function HomeBannerSceneLayer({ animate, scene }: { animate: boolean; scene: HomeBannerSceneKind }) {
  return (
    <>
      <Image resizeMode="cover" source={HOME_METRIC_BACKGROUNDS[scene.background]} style={styles.homeGaugeFeatureImage} />
      {animate && (
        <HomeMotionLayer>
          {(scene.motion === 'rain' || scene.motion === 'snow') && <HomeFallingWeatherOverlay kind={scene.motion} />}
          {scene.motion === 'wind' && <HomeWindOverlay />}
          {scene.motion === 'clear' && <HomeClearSkyOverlay />}
          {scene.motion === 'cloudy' && <HomeCloudDriftOverlay />}
        </HomeMotionLayer>
      )}
    </>
  );
}

// 배너 배경 이미지와 비·눈·구름 효과를 한 장면으로 보고, 장면이 바뀌면
// 이전 장면은 서서히 사라지고(페이드 아웃) 새 장면은 서서히 나타납니다(페이드 인).
function HomeBannerScene({ animate, scene }: { animate: boolean; scene: HomeBannerSceneKind }) {
  const sceneKey = `${scene.background}-${scene.motion}`;
  const [shown, setShown] = useState<{ current: HomeBannerSceneKind; key: string; previous?: HomeBannerSceneKind & { key: string } }>(
    { current: scene, key: sceneKey },
  );
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (sceneKey === shown.key) return;
    if (!animate) {
      setShown({ current: scene, key: sceneKey });
      return;
    }
    progress.setValue(0);
    setShown({ current: scene, key: sceneKey, previous: { ...shown.current, key: shown.key } });
    const animation = Animated.timing(progress, { duration: 500, easing: Easing.inOut(Easing.quad), toValue: 1, useNativeDriver: true });
    animation.start(({ finished }) => {
      if (finished) setShown({ current: scene, key: sceneKey });
    });
    return () => animation.stop();
    // 장면이 바뀔 때(sceneKey)만 전환을 시작합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, sceneKey]);
  return (
    <>
      {shown.previous && (
        <Animated.View
          key={shown.previous.key}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: HOME_METRIC_BACKGROUND_COLORS[shown.previous.background], opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
        >
          <HomeBannerSceneLayer animate={animate} scene={shown.previous} />
        </Animated.View>
      )}
      <Animated.View
        key={shown.key}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: HOME_METRIC_BACKGROUND_COLORS[shown.current.background] }, shown.previous && { opacity: progress }]}
      >
        <HomeBannerSceneLayer animate={animate} scene={shown.current} />
      </Animated.View>
    </>
  );
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

// 게이지 원 안에 숫자가 들어가도록 글자 크기를 줄입니다. 원 안쪽 폭의 약 70%를 쓰고,
// 숫자 한 자는 글자 크기의 0.6배, 소수점·쉼표는 그 절반 정도 폭으로 셉니다.
function gaugeValueFontSize(value: string, size: number, baseFontSize: number) {
  const narrow = (value.match(/[.,:]/g) ?? []).length;
  const units = Math.max(1, value.length - narrow * 0.6);
  return Math.max(12, Math.min(baseFontSize, Math.floor((size * 0.7) / (units * 0.6))));
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// 숫자 한 자리를 0~9가 세로로 쌓인 띠로 그리고, 값이 바뀌면 띠를 굴려 새 숫자로 옮깁니다.
// 처음 그릴 때는 굴리지 않습니다(0부터 차오르면 가짜 숫자처럼 보임).
function HomeRollingDigit({ animate, digit, fontSize, lineHeight, style }: {
  animate: boolean;
  digit: number;
  fontSize: number;
  lineHeight: number;
  style: object;
}) {
  const position = useRef(new Animated.Value(digit)).current;
  useEffect(() => {
    if (!animate) {
      position.setValue(digit);
      return;
    }
    const animation = Animated.timing(position, { duration: 500, easing: Easing.out(Easing.cubic), toValue: digit, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [animate, digit, position]);
  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: Animated.multiply(position, -lineHeight) }] }}>
        {DIGITS.map((d) => (
          <Text key={d} allowFontScaling={false} style={[style, { fontSize, fontVariant: ['tabular-nums'], height: lineHeight, includeFontPadding: false, lineHeight, marginTop: 0, textAlignVertical: 'center' }]}>{d}</Text>
        ))}
      </Animated.View>
    </View>
  );
}

// 게이지 가운데 값. 숫자는 자리마다 따로 굴러가고 '-' '.' 같은 글자는 그대로 둡니다.
// 자리는 오른쪽부터 맞춰서, 21 → 9처럼 자릿수가 줄어도 일의 자리는 이어서 굴러갑니다.
function HomeRollingValue({ animate, fontSize, lineHeight, style, value }: {
  animate: boolean;
  fontSize: number;
  lineHeight: number;
  style: object;
  value: string;
}) {
  const chars = value.split('');
  return (
    <View accessible accessibilityLabel={value} style={{ flexDirection: 'row' }}>
      {chars.map((char, index) => {
        const place = chars.length - index;
        return /\d/.test(char)
          ? <HomeRollingDigit key={`d${place}`} animate={animate} digit={Number(char)} fontSize={fontSize} lineHeight={lineHeight} style={style} />
          : <Text key={`s${place}`} allowFontScaling={false} style={[style, { fontSize, height: lineHeight, includeFontPadding: false, lineHeight, marginTop: 0, textAlignVertical: 'center' }]}>{char}</Text>;
      })}
    </View>
  );
}

function HomeCircularGauge({ animate, gaugeSize, large = false, progress, revealed, tone, unit, value }: HomeCircularGaugeProps & {
  animate: boolean;
  revealed: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const size = gaugeSize ?? (large ? 132 : 62);
  const stroke = large ? 10 : 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * 0.78;
  const safeProgress = Math.max(0.04, Math.min(1, progress));
  // 슬라이드가 처음 화면에 들어오기 전에는 비워 두고, 들어오면 값까지 한 번 차오릅니다. 그 뒤로 값이 바뀌면 이전 값에서 이어서 움직입니다.
  const targetProgress = revealed ? safeProgress : 0;
  const shownProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animate) {
      shownProgress.setValue(targetProgress);
      return;
    }
    const animation = Animated.timing(shownProgress, { duration: 600, easing: Easing.out(Easing.cubic), toValue: targetProgress, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [animate, shownProgress, targetProgress]);
  const baseFontSize = large ? gaugeValueFontSize(String(value), size, 38) : 11;
  // 굴러가는 띠의 높이를 글자 높이와 정확히 맞추려고 글자 확대는 직접 계산합니다(원래처럼 최대 1.2배).
  const textScale = Math.min(fontScale, 1.2);
  const valueFontSize = baseFontSize * textScale;
  const valueLineHeight = Math.round(baseFontSize * 1.1 * textScale);
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
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="#ffffff"
            strokeDasharray={`${arc} ${circumference}`}
            strokeDashoffset={shownProgress.interpolate({ inputRange: [0, 1], outputRange: [arc, 0] })}
            strokeLinecap="round"
            strokeWidth={stroke}
            transform={`rotate(130 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.homeCircularGaugeCenter}>
          <View style={{ marginTop: 1 }}>
            <HomeRollingValue
              animate={animate}
              fontSize={valueFontSize}
              lineHeight={valueLineHeight}
              style={[styles.homeCircularGaugeValue, large && styles.homeCircularGaugeValueLarge]}
              value={String(value)}
            />
          </View>
          <Text style={[styles.homeCircularGaugeUnit, large && styles.homeCircularGaugeUnitLarge]}>{unit}</Text>
        </View>
      </View>
    </View>
  );
}

function HomeInfoGaugeSlide({ animate, comparison, gaugeSize, progress, revealed, slideHeight, status, title, tone, unit, value, width }: {
  animate: boolean;
  revealed: boolean;
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
        <HomeCircularGauge animate={animate} gaugeSize={gaugeSize} large progress={progress} revealed={revealed} tone={tone} unit={unit} value={value} />
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
  const reduceMotion = useReduceMotion();
  // 한 번이라도 화면에 들어온 게이지 슬라이드. 처음 들어올 때만 호가 차오릅니다.
  const [revealedSlides, setRevealedSlides] = useState<ReadonlySet<string>>(() => new Set());
  const [carouselIndex, setCarouselIndex] = useState(1);
  const [homeSectionTab, setHomeSectionTab] = useState<HomeSectionKey>('guide');
  const homeSectionTabs = HOME_SECTION_TABS.filter((tab) => outfitEnabled || tab.key !== 'outfit');
  const activeHomeSection = homeSectionTabs.some((tab) => tab.key === homeSectionTab) ? homeSectionTab : 'guide';
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
  const peekForecast = selectedForecastIndex > 0 ? bannerForecastItems[selectedForecastIndex] : undefined;
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
  // 시간별 예보 줄: 칸을 누르면 그 시간을 고릅니다. 줄은 원래대로 맨 왼쪽("지금")부터 시작합니다.
  const shownForecastIndex = Math.max(0, selectedForecastIndex);
  const selectForecastIndex = (index: number) => {
    const item = bannerForecastItems[index];
    if (!item || index === shownForecastIndex) return;
    setSelectedForecastKey(index === 0 ? null : item.key);
    Haptics.selectionAsync().catch(() => {});
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
      <View style={styles.homeSectionCard}>
        <View accessibilityRole="tablist" style={styles.homeSectionTabRow}>
          {homeSectionTabs.map((tab) => {
            const selected = tab.key === activeHomeSection;
            return (
              <Pressable
                accessibilityLabel={tab.ai ? `${tab.label}, AI 추천` : tab.label}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={tab.key}
                onPress={() => setHomeSectionTab(tab.key)}
                style={({ pressed }) => [styles.homeSectionTab, selected && { borderBottomColor: accentTone }, pressed && styles.pressedFeedback]}
              >
                {selected ? <HomeMotionActionIcon name={tab.icon} size={24} /> : <AppActionIcon name={tab.icon} size={24} style={styles.homeSectionTabIconMuted} />}
                <View style={styles.homeSectionTabLabelRow}>
                  {tab.ai && <Ionicons color={selected ? bauhausColors.blue : textColors.disabled} name="sparkles" size={11} />}
                  <Text style={[styles.homeSectionTabText, selected && styles.homeSectionTabTextSelected]}>{tab.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

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
      </View>
    </View>
  );
}

