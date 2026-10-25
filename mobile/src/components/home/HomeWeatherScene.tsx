// 홈 배너 배경과 날씨 효과(비·눈·바람·맑음·구름), 장면이 바뀔 때의 페이드 전환.
import { Animated, Easing, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { styles } from '../../styles/appStyles';
import { toNumber } from '../../utils/format';
import { isThunderWeather } from '../../features/outing/outingIndex';
import { getWeatherVisualKind, type WeatherVisualKind } from '../../utils/weather';
import { fallTiltDegrees, rainDropCount, snowFlakeCount } from './precipitationMotion';

type HomeWeatherMotionKind = WeatherVisualKind | 'wind' | 'thunder';

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


const HOME_WIND_CLOUDS = {
  large: require('../../../assets/home-wind-cloud-large-v1.png'),
  small: require('../../../assets/home-wind-cloud-small-v1.png'),
} as const;

const HOME_WIND_STREAK_OVERLAY = require('../../../assets/home-wind-streak-overlay-v2.png');


export function getHomeWeatherMotionKind(label?: string | null, windSpeed?: number | string | null): HomeWeatherMotionKind {
  const weatherKind = getWeatherVisualKind(label ?? undefined);
  if (isThunderWeather(label ?? undefined)) return 'thunder';
  if (weatherKind === 'rain' || weatherKind === 'snow') return weatherKind;
  const numericWindSpeed = toNumber(windSpeed);
  if (numericWindSpeed !== undefined && numericWindSpeed >= 8) return 'wind';
  return weatherKind;
}

export type HomePrecipitationConditions = { mm?: number; windSpeed?: number };

// 비·눈: 개수는 강수량, 기울기는 풍속으로 정한다(precipitationMotion.ts). 방향은 오른쪽 위→왼쪽 아래.
// 겹(뒤·앞)마다 빗줄기·눈송이를 한 장의 SVG에 그려 두고 그 장을 통째로 비스듬히 흘린다.
// 하나하나 움직이면 100개일 때 120Hz 화면에서 프레임이 29% 끊겼다(2026-10-24 실기기 측정). 움직이는 값은 겹마다 하나뿐이다.
const PRECIPITATION_TILE_HEIGHT = 230; // 한 장의 세로 길이. 배너보다 길고, 두 장을 이어 붙여 끊김 없이 반복한다.

type PrecipitationLook = { color: string; duration: number; share: number; size: (random: number) => number; width: number };
const PRECIPITATION_LOOKS: Record<'rain' | 'snow', { far: PrecipitationLook; near: PrecipitationLook }> = {
  // 비: 가늘고 긴 줄. 뒤 겹 초당 약 200dp, 앞 겹 약 290dp.
  rain: {
    far: { color: 'rgba(205, 225, 255, 0.55)', duration: 1150, share: 0.6, size: (random) => 11 + random * 9, width: 1.3 },
    near: { color: 'rgba(225, 238, 255, 0.8)', duration: 800, share: 0.4, size: (random) => 20 + random * 14, width: 2 },
  },
  // 눈: 동그란 송이(size는 지름). 뒤 겹 초당 약 40dp, 앞 겹 약 60dp로 천천히.
  snow: {
    far: { color: 'rgba(240, 246, 255, 0.7)', duration: 5800, share: 0.6, size: (random) => 2.5 + random * 1.5, width: 0 },
    near: { color: 'rgba(255, 255, 255, 0.95)', duration: 3800, share: 0.4, size: (random) => 4.5 + random * 3, width: 0 },
  },
};

function HomePrecipitationOverlay({ conditions, kind }: { conditions?: HomePrecipitationConditions; kind: 'rain' | 'snow' }) {
  const count = kind === 'rain' ? rainDropCount(conditions?.mm) : snowFlakeCount(conditions?.mm);
  const tilt = fallTiltDegrees(conditions?.windSpeed);
  const looks = PRECIPITATION_LOOKS[kind];
  return (
    <>
      {kind === 'rain' && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4, 18, 52, 0.22)' }]} />}
      <HomePrecipitationSheet count={Math.round(count * looks.far.share)} kind={kind} look={looks.far} seed={1} tilt={tilt} />
      <HomePrecipitationSheet count={Math.round(count * looks.near.share)} kind={kind} look={looks.near} seed={2} tilt={tilt} />
    </>
  );
}

function HomePrecipitationSheet({ count, kind, look, seed, tilt }: { count: number; kind: 'rain' | 'snow'; look: PrecipitationLook; seed: number; tilt: number }) {
  const { width: screenWidth } = useWindowDimensions();
  const progress = useLoopingValue(look.duration, 'forward');
  const angle = (tilt * Math.PI) / 180;
  const height = PRECIPITATION_TILE_HEIGHT;
  const shiftX = height * Math.tan(angle); // 한 장 내려갈 때 왼쪽으로 가는 거리
  // 장은 위로 이어 붙인 장이 오른쪽으로 비켜 있어도 화면 왼쪽까지 덮게 양옆을 넓힌다.
  const sheetLeft = -shiftX - 30;
  const sheetWidth = screenWidth + shiftX * 2 + 60;
  const longest = look.size(1) + 4;
  const items = useMemo(() => {
    // 화면에 보이는 개수가 count가 되도록, 넓힌 만큼 더 그린다. 자리는 고정된 무작위 값(다시 그려도 같은 자리).
    const total = Math.round(count * (sheetWidth / screenWidth));
    return Array.from({ length: total }, (_, index) => {
      const random = (salt: number) => {
        const value = Math.sin((index + 1) * 12.9898 + (salt + seed * 10) * 78.233) * 43758.5453;
        return value - Math.floor(value);
      };
      return { size: look.size(random(3)), x: random(2) * sheetWidth, y: random(1) * height };
    });
  }, [count, height, look, screenWidth, seed, sheetWidth]);

  const sheet = (
    <Svg height={height + longest} pointerEvents="none" width={sheetWidth}>
      {items.map((item, index) => (kind === 'rain'
        ? <Line key={index} stroke={look.color} strokeLinecap="round" strokeWidth={look.width} x1={item.x} x2={item.x - item.size * Math.sin(angle)} y1={item.y} y2={item.y + item.size * Math.cos(angle)} />
        : <Circle cx={item.x} cy={item.y} fill={look.color} key={index} r={item.size / 2} />))}
    </Svg>
  );
  // 두 장을 대각선으로 이어 붙여(위 장은 한 장만큼 위·오른쪽) 한 장만큼 흘리고 처음으로 돌아간다. 무늬가 같아 이음새 없이 반복된다.
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        left: sheetLeft,
        position: 'absolute',
        top: 0,
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -shiftX] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) },
        ],
      }}
    >
      <View style={{ left: shiftX, position: 'absolute', top: -height }}>{sheet}</View>
      <View style={{ left: 0, position: 'absolute', top: 0 }}>{sheet}</View>
    </Animated.View>
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

function HomeWindStreaks({ duration = 1400, offsetY = 0, opacity = 0.6 }: { duration?: number; offsetY?: number; opacity?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        duration,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [duration, progress]);

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
              opacity,
              width: screenWidth,
              transform: [{ translateX: Animated.add(travel, layerIndex * screenWidth) }, { translateY: offsetY }],
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
      <HomeWindStreaks duration={900} offsetY={46} opacity={0.4} />
      <HomeWindCloud delayMs={0} duration={4600} height={116} opacity={0.55} source={HOME_WIND_CLOUDS.large} top={-18} width={206} />
      <HomeWindCloud delayMs={1700} duration={5600} height={92} opacity={0.42} source={HOME_WIND_CLOUDS.small} top={78} width={174} />
      <HomeWindCloud delayMs={3500} duration={6200} height={74} opacity={0.24} source={HOME_WIND_CLOUDS.large} top={42} width={132} />
    </>
  );
}

// 천둥번개: 빗줄기 위로 몇 초마다 화면이 두 번 번쩍입니다.
function HomeLightningFlash() {
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const blink = (toValue: number, duration: number) => Animated.timing(flash, { duration, easing: Easing.linear, toValue, useNativeDriver: true });
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(2600),
      blink(0.75, 60), blink(0.1, 90), blink(0.55, 50), blink(0, 420),
      Animated.delay(1800),
    ]));
    animation.start();
    return () => animation.stop();
  }, [flash]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#EAF2FF', opacity: flash }]} />;
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

function HomeBannerSceneLayer({ animate, precipitation, scene }: { animate: boolean; precipitation?: HomePrecipitationConditions; scene: HomeBannerSceneKind }) {
  return (
    <>
      <Image resizeMode="cover" source={HOME_METRIC_BACKGROUNDS[scene.background]} style={styles.homeGaugeFeatureImage} />
      {animate && (
        <HomeMotionLayer>
          {(scene.motion === 'rain' || scene.motion === 'snow') && <HomePrecipitationOverlay conditions={precipitation} kind={scene.motion} />}
          {scene.motion === 'thunder' && <><HomePrecipitationOverlay conditions={precipitation} kind="rain" /><HomeLightningFlash /></>}
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
export function HomeBannerScene({ animate, precipitation, scene }: { animate: boolean; precipitation?: HomePrecipitationConditions; scene: HomeBannerSceneKind }) {
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
          <HomeBannerSceneLayer animate={animate} precipitation={precipitation} scene={shown.previous} />
        </Animated.View>
      )}
      <Animated.View
        key={shown.key}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: HOME_METRIC_BACKGROUND_COLORS[shown.current.background] }, shown.previous && { opacity: progress }]}
      >
        <HomeBannerSceneLayer animate={animate} precipitation={precipitation} scene={shown.current} />
      </Animated.View>
    </>
  );
}
