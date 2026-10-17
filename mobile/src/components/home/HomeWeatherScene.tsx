// 홈 배너 배경과 날씨 효과(비·눈·바람·맑음·구름), 장면이 바뀔 때의 페이드 전환.
import { Animated, Easing, Image, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { styles } from '../../styles/appStyles';
import { toNumber } from '../../utils/format';
import { getWeatherVisualKind, type WeatherVisualKind } from '../../utils/weather';

type HomeWeatherMotionKind = WeatherVisualKind | 'wind';

const HOME_METRIC_BACKGROUNDS = {
  clear: require('../../../assets/home-metric-clear-v3.png'),
  cloudy: require('../../../assets/home-metric-cloudy-v1.png'),
  rain: require('../../../assets/home-metric-rain-v1.png'),
  snow: require('../../../assets/home-metric-snow-v1.png'),
} as const;

export const HOME_METRIC_BACKGROUND_COLORS: Record<WeatherVisualKind, string> = {
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

export function getHomeWeatherMotionKind(label?: string | null, windSpeed?: number | string | null): HomeWeatherMotionKind {
  const weatherKind = getWeatherVisualKind(label ?? undefined);
  if (weatherKind === 'rain' || weatherKind === 'snow') return weatherKind;
  const numericWindSpeed = toNumber(windSpeed);
  if (numericWindSpeed !== undefined && numericWindSpeed >= 8) return 'wind';
  return weatherKind;
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
export function HomeBannerScene({ animate, scene }: { animate: boolean; scene: HomeBannerSceneKind }) {
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
