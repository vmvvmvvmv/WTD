import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { semanticColors } from '../../theme/semanticColors';
import { bauhausColors, textColors } from '../../theme/bauhaus';
import { AppActionIcon } from './AppActionIcon';
import { WeatherIcon } from './WeatherIcon';

// 튜토리얼 스토리보드: 환영 시트 → 홈 투어(시간별 예보가 있으면 5단계, 없으면 4단계) → 캘린더 추가 버튼 말풍선.
// 움직임은 말풍선 페이드만. 강조 영역은 다음 자리로 바로 옮기고, 단계 사이에 화면을 다시 덮지 않는다.
// 강조할 요소에는 ref={tutorialTarget('이름')}을 붙인다.

const TOUR_STEPS = [
  { body: '지역 이름을 눌러 바꾸고, 지역 검색에서 다른 곳을 찾아볼 수 있어요.', target: 'homeRegion', title: '지역 바꾸기·검색' },
  { body: '지금 날씨와 미세먼지를 보여 줘요. 옆으로 밀면 다른 정보도 볼 수 있어요.', target: 'homeBanner', title: '날씨 배너' },
  { body: '날짜를 누르면 시간별 예보가 열려요. 시간을 고르면 위 배너가 바뀌어요.', target: 'homeHourly', title: '4일 예보' },
  { body: '일정 가이드, 추천 옷차림, 날씨 지도를 여기서 골라 볼 수 있어요.', target: 'homeSections', title: '홈에서 골라 보기' },
  { body: '이어서 캘린더를 열어 볼게요. 일정을 적으면 그때 날씨도 같이 볼 수 있어요.', target: 'tabCalendar', title: '캘린더에서 일정 추가' },
];

type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };
type Rect = { height: number; width: number; x: number; y: number };

const targets = new Map<string, Measurable | null>();
const targetRefs = new Map<string, (node: Measurable | null) => void>();

export function tutorialTarget(name: string) {
  let ref = targetRefs.get(name);
  if (!ref) {
    ref = (node) => { targets.set(name, node); };
    targetRefs.set(name, ref);
  }
  return ref;
}

// RN 0.81 + edge-to-edge(안드로이드)에서는 measureInWindow가 상태 표시줄 높이만큼 위쪽 값을 돌려준다.
// 튜토리얼 화면(Modal)은 화면 맨 위부터 그려지므로 그만큼 더한다. 2026-10-22 실기기 캡처로 확인함.
// ponytail: RN 0.86부터 measureInWindow가 고쳐졌으니, 올리면 이 보정을 지운다.
const MEASURE_Y_FIX = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

function measureTarget(name: string) {
  return new Promise<Rect | null>((resolve) => {
    const node = targets.get(name);
    if (!node) return resolve(null);
    node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { height, width, x, y: y + MEASURE_Y_FIX } : null));
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function useFadeIn(visible: boolean) {
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      return;
    }
    Animated.timing(opacity, { duration: reduceMotion ? 0 : 150, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }).start();
  }, [opacity, reduceMotion, visible]);
  return opacity;
}

// 설명 카드의 작은 화살표가 강조 대상을 가리킨다. 아래에 자리가 없으면 설명을 위에 둔다.
function Bubble({ children, rect, visible }: { children: ReactNode; rect: Rect; visible: boolean }) {
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const opacity = useFadeIn(visible);
  // 카드 높이는 문구 줄 수·글자 크기에 따라 달라서 실제로 잰 값을 쓴다. 재기 전에는 넉넉히 잡는다.
  const [bubbleHeight, setBubbleHeight] = useState(260);
  const below = rect.y + rect.height + 14 + bubbleHeight + 16 < screenHeight;
  const arrowLeft = Math.min(Math.max(rect.x + rect.width / 2 - 28, 16), screenWidth - 56);
  return (
    <Animated.View
      onLayout={(event) => setBubbleHeight(event.nativeEvent.layout.height)}
      style={[
        styles.bubble,
        { opacity, width: screenWidth - 40 },
        below ? { top: rect.y + rect.height + 14 } : { bottom: screenHeight - rect.y + 14 },
      ]}
    >
      <View pointerEvents="none" style={[styles.arrow, { left: arrowLeft }, below ? styles.arrowUp : styles.arrowDown]} />
      {children}
    </Animated.View>
  );
}

const PAD = 6;

// 홈 투어의 마지막 버튼은 캘린더로 이어진다. 시작할 때 홈을 맨 위로 올린 뒤 필요할 때만 한 번 더 스크롤한다.
// hasHourlyForecast가 undefined면 예보를 아직 불러오는 중이다. 그동안은 어두운 막과 로딩 표시만 띄운다.
export function TutorialTour({ hasHourlyForecast, onContinueCalendar, onFinish, scrollHome }: { hasHourlyForecast?: boolean; onContinueCalendar: () => void; onFinish: () => void; scrollHome: (y: number) => void }) {
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  // 단계 목록은 예보 결과가 처음 나왔을 때 한 번만 정한다. 투어 도중에 단계 수가 바뀌지 않게.
  const stepsRef = useRef<typeof TOUR_STEPS | null>(null);
  if (!stepsRef.current && hasHourlyForecast !== undefined) {
    stepsRef.current = hasHourlyForecast ? TOUR_STEPS : TOUR_STEPS.filter((item) => item.target !== 'homeHourly');
  }
  const steps = stepsRef.current;
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const step = steps?.[stepIndex];
  const isLast = steps !== null && stepIndex === steps.length - 1;

  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    setBubbleVisible(false); // 말풍선만 잠깐 감추고, 어두운 막과 이전 강조 자리는 그대로 둔다.
    (async () => {
      if (stepIndex === 0) {
        // 설정에서 다시 열면 홈으로 막 넘어온 참이라, 화면 전환이 끝난 뒤에 맨 위로 올리고 잰다.
        await wait(250);
        scrollHome(0);
        await wait(350);
      }
      let next = await measureTarget(step.target);
      if (next && step.target !== 'tabCalendar' && next.y + next.height > screenHeight * 0.6) {
        scrollHome(Math.max(0, next.y - 180));
        await wait(320);
        next = await measureTarget(step.target);
      }
      if (cancelled) return;
      if (!next) {
        // 화면에 없는 요소(예: 옷차림을 꺼서 탭이 다름)는 건너뛴다.
        if (isLast) onFinish();
        else setStepIndex(stepIndex + 1);
        return;
      }
      setRect(next);
      setBubbleVisible(true);
    })();
    return () => { cancelled = true; };
    // 단계가 바뀔 때와 예보 결과가 처음 나왔을 때만 다시 잰다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, steps]);

  const hole = rect && { height: rect.height + PAD * 2, width: rect.width + PAD * 2, x: Math.max(0, rect.x - PAD), y: Math.max(0, rect.y - PAD) };

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onFinish} statusBarTranslucent transparent visible>
      {hole && steps && step ? (
        <View style={StyleSheet.absoluteFill}>
          <View style={[styles.dim, { height: hole.y, left: 0, top: 0, width: screenWidth }]} />
          <View style={[styles.dim, { bottom: 0, left: 0, top: hole.y + hole.height, width: screenWidth }]} />
          <View style={[styles.dim, { height: hole.height, left: 0, top: hole.y, width: hole.x }]} />
          <View style={[styles.dim, { height: hole.height, left: hole.x + hole.width, right: 0, top: hole.y }]} />
          <Bubble rect={hole} visible={bubbleVisible}>
            <Text style={styles.counter}>{stepIndex + 1} / {steps.length}</Text>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((stepIndex + 1) / steps.length) * 100}%` }]} />
            </View>
            <Text accessibilityRole="header" style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
            <View style={styles.actions}>
              {!isLast && (
                <Pressable accessibilityRole="button" hitSlop={10} onPress={onFinish}>
                  <Text style={styles.secondary}>건너뛰기</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={!bubbleVisible}
                onPress={() => (isLast ? onContinueCalendar() : setStepIndex(stepIndex + 1))}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              >
                <Text style={styles.primaryText}>{isLast ? '캘린더로' : '다음'}</Text>
              </Pressable>
            </View>
          </Bubble>
        </View>
      ) : (
        <View style={[styles.dim, styles.loading, StyleSheet.absoluteFill]}>
          <ActivityIndicator accessibilityLabel="튜토리얼 준비 중" color={bauhausColors.white} size="large" />
        </View>
      )}
    </Modal>
  );
}

// 첫 실행 때 홈 위로 올라오는 환영 시트. 원하는 사람만 투어를 본다.
// 환영 시트 위쪽 그림: 일정 → 그때 날씨 → 옷차림 순서로 한 번만 떠오른다. 동작 줄이기면 바로 다 보인다.
function WelcomeMotion() {
  const reduceMotion = useReducedMotion();
  const steps = useRef([0, 1, 2].map(() => new Animated.Value(reduceMotion ? 1 : 0))).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.stagger(450, steps.map((value) => Animated.timing(value, { delay: 200, duration: 320, easing: Easing.out(Easing.back(1.6)), toValue: 1, useNativeDriver: true }))).start();
  }, [reduceMotion, steps]);
  const tiles = [
    <AppActionIcon key="schedule" name="schedule" size={30} />,
    <WeatherIcon key="rain" kind="rain" size={30} />,
    <AppActionIcon key="outfit" name="outfit" size={30} />,
  ];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.motionRow}>
      {tiles.map((tile, index) => (
        <View key={index} style={styles.motionItem}>
          {index > 0 && (
            <Animated.View style={[styles.motionArrow, { opacity: steps[index] }]}>
              <Ionicons color={textColors.disabled} name="chevron-forward" size={18} />
            </Animated.View>
          )}
          <Animated.View style={[styles.sheetIcon, { opacity: steps[index], transform: [{ translateY: steps[index].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: steps[index].interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}>
            {tile}
          </Animated.View>
        </View>
      ))}
    </View>
  );
}

// 첫 실행 시트: 기능 둘러보기와 닫기를 선택한다.
export function WelcomeSheet({ onLater, onStart }: { onLater: () => void; onStart: () => void }) {
  const reduceMotion = useReducedMotion();
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : 40)).current;
  useEffect(() => {
    Animated.timing(translateY, { duration: reduceMotion ? 0 : 220, easing: Easing.out(Easing.cubic), toValue: 0, useNativeDriver: true }).start();
  }, [reduceMotion, translateY]);
  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onLater} statusBarTranslucent transparent visible>
      <View style={[styles.dim, StyleSheet.absoluteFill]} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.sheetHandle} />
        <WelcomeMotion />
        <Text accessibilityRole="header" style={styles.sheetTitle}>웨더투두를 둘러볼까요?</Text>
        <Text style={styles.sheetBody}>날씨와 옷차림, 일정 기능을 차례로 보여 드려요.</Text>
        <View style={styles.sheetActions}>
          <Pressable accessibilityRole="button" onPress={onStart} style={({ pressed }) => [styles.sheetPrimary, pressed && styles.pressed]}>
            <Text style={[styles.primaryText, styles.sheetPrimaryText]}>기능 둘러보기</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onLater} style={({ pressed }) => [styles.sheetSecondary, pressed && styles.pressed]}>
            <Text style={styles.sheetSecondaryText}>괜찮아요</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

// 캘린더를 처음 열 때 + 버튼 위에 한 번 뜨는 말풍선. 화면을 어둡게 덮지 않고, 아무 데나 누르면 닫힌다.
export function CalendarTip({ onDone }: { onDone: () => void }) {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    let cancelled = false;
    // 탭 전환과 일정 추가 버튼의 등장 애니메이션이 끝난 뒤에 잰다.
    wait(500).then(() => measureTarget('calendarAdd')).then((next) => {
      if (cancelled) return;
      if (next) setRect(next);
      else onDone();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!rect) return null;
  return (
    <Modal animationType="none" navigationBarTranslucent onRequestClose={onDone} statusBarTranslucent transparent visible>
      <Pressable accessibilityLabel="말풍선 닫기" onPress={onDone} style={StyleSheet.absoluteFill}>
        <Bubble rect={rect} visible>
          <Text accessibilityRole="header" style={styles.title}>일정 추가</Text>
          <Text style={styles.body}>오른쪽 아래 버튼을 눌러 직접 적거나, AI로 한 번에 넣어 보세요.</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>확인</Text>
            </Pressable>
          </View>
        </Bubble>
      </Pressable>
    </Modal>
  );
}

const accent = semanticColors.outfit.accent;

const styles = StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row', gap: 18, justifyContent: 'flex-end', marginTop: 18 },
  body: { color: textColors.secondary, fontSize: 14, fontWeight: '600', lineHeight: 21, marginTop: 8 },
  bubble: { backgroundColor: bauhausColors.white, borderColor: bauhausColors.border, borderRadius: 14, borderWidth: 1, elevation: 8, left: 20, padding: 18, position: 'absolute', shadowColor: bauhausColors.foreground, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 16 },
  arrow: { borderLeftColor: 'transparent', borderLeftWidth: 8, borderRightColor: 'transparent', borderRightWidth: 8, position: 'absolute' },
  arrowDown: { borderTopColor: bauhausColors.white, borderTopWidth: 10, bottom: -10 },
  arrowUp: { borderBottomColor: bauhausColors.white, borderBottomWidth: 10, top: -10 },
  counter: { alignSelf: 'flex-start', backgroundColor: bauhausColors.blueSoft, borderRadius: 8, color: accent, fontSize: 11, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  dim: { backgroundColor: 'rgba(15, 20, 30, 0.68)', position: 'absolute' },
  loading: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] }, // 앱 공통 pressedFeedback과 같게.
  primary: { alignItems: 'center', backgroundColor: accent, borderRadius: 999, justifyContent: 'center', minHeight: 42, paddingHorizontal: 20 },
  primaryText: { color: bauhausColors.white, fontSize: 14, fontWeight: '700' },
  progressFill: { backgroundColor: accent, borderRadius: 3, height: 4 },
  progressTrack: { backgroundColor: bauhausColors.blueSoft, borderRadius: 3, height: 4, marginTop: 12, overflow: 'hidden' },
  secondary: { color: textColors.secondary, fontSize: 14, fontWeight: '700' },
  sheet: { backgroundColor: bauhausColors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, bottom: 0, left: 0, paddingBottom: 44, paddingHorizontal: 24, paddingTop: 12, position: 'absolute', right: 0 },
  motionArrow: { marginHorizontal: 8 },
  motionItem: { alignItems: 'center', flexDirection: 'row' },
  motionRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 18 },
  sheetActions: { gap: 10, marginTop: 26 },
  sheetBody: { color: textColors.secondary, fontSize: 15, fontWeight: '600', lineHeight: 23, marginTop: 8 },
  sheetHandle: { alignSelf: 'center', backgroundColor: bauhausColors.border, borderRadius: 3, height: 5, marginBottom: 22, width: 38 },
  sheetIcon: { alignItems: 'center', backgroundColor: bauhausColors.blueSoft, borderRadius: 18, height: 56, justifyContent: 'center', width: 56 },
  sheetPrimary: { alignItems: 'center', backgroundColor: accent, borderRadius: 999, justifyContent: 'center', minHeight: 52 },
  sheetPrimaryText: { fontSize: 16 },
  sheetSecondary: { alignItems: 'center', backgroundColor: bauhausColors.white, borderColor: bauhausColors.border, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 48 },
  sheetSecondaryText: { color: textColors.secondary, fontSize: 15, fontWeight: '700' },
  sheetTitle: { color: textColors.heading, fontSize: 23, fontWeight: '900', lineHeight: 30 },
  title: { color: textColors.heading, fontSize: 18, fontWeight: '900', lineHeight: 24, marginTop: 10 },
});
