import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { semanticColors } from '../../theme/semanticColors';
import type { TabKey } from '../../types/navigation';

// 실제 앱 화면 위에서 요소 하나를 밝게 남기고 나머지를 어둡게 덮어 설명하는 튜토리얼(코치마크).
// 강조할 요소는 ref={coachTarget('이름')}으로 등록한다.

export type CoachStep = {
  body: string;
  tab: TabKey;
  target: string;
  title: string;
};

export const COACH_STEPS: CoachStep[] = [
  { body: '시간을 누르면 위 배너가 그 시간 날씨로 바뀌어요.', tab: 'home', target: 'homeHourly', title: '시간별 예보' },
  { body: '오늘 일정 시간대의 날씨를 살피고,\n뭘 입고 뭘 챙길지 알려 줘요.', tab: 'home', target: 'homeSections', title: '활동 가이드 · 추천 옷차림' },
  { body: '시간과 장소를 넣으면 그때 그곳의\n날씨와 미세먼지를 같이 보여 줘요.', tab: 'calendar', target: 'calendarAdd', title: '일정 추가' },
];

type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };
const targets = new Map<string, Measurable | null>();
const targetRefs = new Map<string, (node: Measurable | null) => void>();

export function coachTarget(name: string) {
  let ref = targetRefs.get(name);
  if (!ref) {
    ref = (node) => { targets.set(name, node); };
    targetRefs.set(name, ref);
  }
  return ref;
}

type Rect = { height: number; width: number; x: number; y: number };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function measure(name: string) {
  return new Promise<Rect | null>((resolve) => {
    const node = targets.get(name);
    if (!node) return resolve(null);
    node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { height, width, x, y } : null));
  });
}

const PADDING = 6;
const TOOLTIP_SPACE = 190;

// 탭을 옮기면 화면 트리가 바뀌어 이 컴포넌트가 다시 만들어진다. 그래서 단계(stepIndex)는 부모가 들고 있는다.
export function CoachMarkOverlay({
  activeTab,
  onDone,
  onNavigate,
  onScrollHome,
  onStepChange: setStepIndex,
  stepIndex,
}: {
  activeTab: TabKey;
  onDone: () => void;
  onNavigate: (tab: TabKey) => void;
  onScrollHome: (y: number) => void;
  onStepChange: (index: number) => void;
  stepIndex: number;
}) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [rect, setRect] = useState<Rect | null>(null);
  const step = COACH_STEPS[stepIndex];

  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    setRect(null);
    (async () => {
      if (step.tab !== activeTab) {
        onNavigate(step.tab);
        return; // 탭이 바뀌면 activeTab이 달라져 이 효과가 다시 돈다.
      }
      await wait(400); // 탭 전환 애니메이션이 끝난 뒤 위치를 잰다.
      // 홈은 맨 위에서 재야 아래 스크롤 거리를 바로 계산할 수 있다(창 기준 y = 맨 위에서의 위치).
      if (step.tab === 'home') {
        onScrollHome(0);
        await wait(350);
      }
      let measured = await measure(step.target);
      // 화면 아래에 가려 있으면 홈을 그만큼 올리고 다시 잰다.
      if (measured && step.tab === 'home' && measured.y + measured.height > windowHeight - TOOLTIP_SPACE) {
        onScrollHome(Math.max(0, measured.y - 160));
        await wait(400);
        measured = await measure(step.target);
      }
      if (cancelled) return;
      if (!measured) {
        // 화면에 없는 요소(예: 예보가 아직 없음)는 건너뛴다.
        if (stepIndex + 1 < COACH_STEPS.length) setStepIndex(stepIndex + 1);
        else onDone();
        return;
      }
      setRect(measured);
    })();
    return () => { cancelled = true; };
    // 단계나 탭이 바뀔 때만 다시 잰다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, activeTab]);

  const isLast = stepIndex === COACH_STEPS.length - 1;
  const next = () => (isLast ? onDone() : setStepIndex(stepIndex + 1));

  const hole = rect && {
    height: rect.height + PADDING * 2,
    width: rect.width + PADDING * 2,
    x: Math.max(0, rect.x - PADDING),
    y: Math.max(0, rect.y - PADDING),
  };
  const tooltipBelow = hole ? hole.y + hole.height + TOOLTIP_SPACE < windowHeight : true;

  return (
    <Modal animationType="fade" onRequestClose={onDone} statusBarTranslucent transparent visible>
      <View style={StyleSheet.absoluteFill}>
        {hole ? (
          <>
            {/* 밝게 남길 영역을 빼고 위·아래·왼쪽·오른쪽 네 조각으로 덮는다. */}
            <View style={[coachStyles.dim, { height: hole.y, left: 0, top: 0, width: windowWidth }]} />
            <View style={[coachStyles.dim, { bottom: 0, left: 0, top: hole.y + hole.height, width: windowWidth }]} />
            <View style={[coachStyles.dim, { height: hole.height, left: 0, top: hole.y, width: hole.x }]} />
            <View style={[coachStyles.dim, { height: hole.height, left: hole.x + hole.width, right: 0, top: hole.y }]} />
            <View pointerEvents="none" style={[coachStyles.ring, { height: hole.height, left: hole.x, top: hole.y, width: hole.width }]} />
            <View
              style={[
                coachStyles.tooltip,
                tooltipBelow ? { top: hole.y + hole.height + 14 } : { bottom: windowHeight - hole.y + 14 },
              ]}
            >
              <Text style={coachStyles.counter}>{stepIndex + 1} / {COACH_STEPS.length}</Text>
              <Text accessibilityRole="header" style={coachStyles.title}>{step.title}</Text>
              <Text style={coachStyles.body}>{step.body}</Text>
              <View style={coachStyles.actions}>
                {!isLast && (
                  <Pressable accessibilityRole="button" hitSlop={10} onPress={onDone}>
                    <Text style={coachStyles.skip}>건너뛰기</Text>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" onPress={next} style={({ pressed }) => [coachStyles.next, pressed && { opacity: 0.8 }]}>
                  <Text style={coachStyles.nextText}>{isLast ? '시작하기' : '다음'}</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <View style={[coachStyles.dim, StyleSheet.absoluteFill]} />
        )}
      </View>
    </Modal>
  );
}

const accent = semanticColors.outfit.accent;

const coachStyles = StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row', gap: 18, justifyContent: 'flex-end', marginTop: 14 },
  body: { color: '#3B4350', fontSize: 14, fontWeight: '700', lineHeight: 21, marginTop: 4 },
  counter: { color: accent, fontSize: 12, fontWeight: '900' },
  dim: { backgroundColor: 'rgba(15, 20, 30, 0.72)', position: 'absolute' },
  next: { backgroundColor: accent, borderRadius: 10, justifyContent: 'center', minHeight: 40, paddingHorizontal: 18 },
  nextText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  ring: { borderColor: '#FFFFFF', borderRadius: 12, borderWidth: 2, position: 'absolute' },
  skip: { color: '#687180', fontSize: 14, fontWeight: '800' },
  title: { color: '#141821', fontSize: 18, fontWeight: '900', marginTop: 4 },
  tooltip: { backgroundColor: '#FFFFFF', borderRadius: 14, left: 20, padding: 16, position: 'absolute', right: 20 },
});
