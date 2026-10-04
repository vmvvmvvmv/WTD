import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  SlideInRight,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useOutfitRecommendation, type OutfitLoadStatus } from '../../features/outfit/useOutfitRecommendation';
import type { CalendarEvent, OutfitRecommendation, OutfitSensitivity } from '../../types/dust';
import { MustHaveIcon, OutfitIcon } from './OutfitIcon';
import { OUTFIT_MOTION } from './motion';
import { outfitStyles } from './outfitStyles';
import { OutfitVisual } from './OutfitVisual';

function useTypewriter(value: string, reduceMotion: boolean) {
  const [visible, setVisible] = useState(reduceMotion ? value : '');
  useEffect(() => {
    if (reduceMotion || !OUTFIT_MOTION.enabled) {
      setVisible(value);
      return;
    }
    setVisible('');
    let index = 0;
    const delay = Math.min(20, Math.max(8, Math.floor(800 / Math.max(value.length, 1))));
    const timer = setInterval(() => {
      index += 1;
      setVisible(value.slice(0, index));
      if (index >= value.length) clearInterval(timer);
    }, delay);
    return () => clearInterval(timer);
  }, [reduceMotion, value]);
  return { complete: () => setVisible(value), visible };
}

function OutfitSkeleton() {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    if (reduceMotion || !OUTFIT_MOTION.enabled) return;
    opacity.value = withRepeat(withTiming(0.9, { duration: 600 }), -1, true);
  }, [opacity, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View accessibilityLabel="옷차림 추천을 불러오는 중" style={[outfitStyles.skeleton, animated]}>
      <View style={[outfitStyles.skeletonLine, { width: '36%' }]} />
      <View style={[outfitStyles.skeletonLine, { height: 16, width: '78%' }]} />
      <View style={[outfitStyles.skeletonLine, { width: '92%' }]} />
    </Animated.View>
  );
}

function TempRangeBar({ maximum, minimum }: { maximum?: number | null; minimum?: number | null }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    progress.value = reduceMotion || !OUTFIT_MOTION.enabled ? 1 : withTiming(1, { duration: OUTFIT_MOTION.emphasis, easing: Easing.out(Easing.cubic) });
  }, [progress, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  if (minimum == null || maximum == null) return null;
  const width = Math.max(14, Math.min(100, ((maximum - minimum + 5) / 25) * 100));
  return (
    <View accessibilityLabel={`체감온도 최저 ${Math.round(minimum)}도, 최고 ${Math.round(maximum)}도`} style={outfitStyles.temperatureRow}>
      <Text style={outfitStyles.temperatureText}>{`${Math.round(minimum)}° ~ ${Math.round(maximum)}°`}</Text>
      <View style={outfitStyles.temperatureTrack}>
        <Animated.View style={[outfitStyles.temperatureFill, { width: `${width}%`, transformOrigin: 'left' }, animated]} />
      </View>
    </View>
  );
}

function MustHaveChip({ item, index }: { item: OutfitRecommendation['must_have'][number]; index: number }) {
  const reduceMotion = useReducedMotion();
  const motion = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || !OUTFIT_MOTION.enabled) return;
    if (item.type === 'umbrella' && item.level === 'required') {
      motion.value = withRepeat(withSequence(withTiming(-4, { duration: 1200 }), withTiming(4, { duration: 1200 })), -1, true);
    } else if (item.type === 'mask' && item.level === 'required') {
      motion.value = withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 }));
    }
  }, [item.level, item.type, motion, reduceMotion]);
  const iconMotion = useAnimatedStyle(() => item.type === 'umbrella'
    ? { transform: [{ rotate: `${motion.value}deg` }] }
    : { opacity: 1 - motion.value * 0.25, transform: [{ scale: 1 + motion.value * 0.08 }] });
  return (
    <Animated.View entering={FadeIn.delay(index * 60).springify().damping(14).stiffness(180).reduceMotion(ReduceMotion.System)}>
      <Pressable
        accessibilityLabel={`${item.label}, ${item.reason}`}
        onPress={() => Haptics.selectionAsync().catch(() => {})}
        style={[outfitStyles.chip, item.level === 'required' && outfitStyles.chipRequired]}
      >
        <Animated.View style={iconMotion}><MustHaveIcon type={item.type} /></Animated.View>
        <Text style={[outfitStyles.chipText, item.level === 'required' && outfitStyles.chipTextRequired]}>{item.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function OutfitCard({ onRetry, result, showRetry = false }: {
  onRetry?: () => void;
  result: OutfitRecommendation;
  showRetry?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const typed = useTypewriter(result.summary, reduceMotion);
  const clothes = useMemo(() => [
    ...result.outfit.top.slice(0, 1),
    ...result.outfit.bottom.slice(0, 1),
    ...result.outfit.outer.slice(0, 1),
  ], [result.outfit.bottom, result.outfit.outer, result.outfit.top]);
  return (
    <Animated.View entering={FadeInDown.duration(OUTFIT_MOTION.transition).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System)} style={outfitStyles.card}>
      <View style={outfitStyles.cardHeader}>
        <View style={outfitStyles.visualFrame}><OutfitVisual result={result} /></View>
        <View style={outfitStyles.cardHeaderText}>
          <Text style={outfitStyles.eyebrow}>옷차림 추천</Text>
          <Pressable accessibilityLabel={result.summary} onPress={typed.complete}>
            <Animated.Text entering={FadeIn.duration(200)} key={`${result.source}-${result.summary}`} style={outfitStyles.summary}>{typed.visible}</Animated.Text>
          </Pressable>
        </View>
        <View style={outfitStyles.sourcePill}><Text style={outfitStyles.source}>{result.source === 'llm' ? 'AI 추천' : '기본 추천'}</Text></View>
      </View>
      <TempRangeBar maximum={result.weather_snapshot.feels_max} minimum={result.weather_snapshot.feels_min} />
      {!!result.must_have.length && <View style={outfitStyles.chipRow}>{result.must_have.map((item, index) => <MustHaveChip index={index} item={item} key={`${item.type}-${item.level}`} />)}</View>}
      <View style={outfitStyles.outfitRow}>{clothes.map((item, index) => <Animated.Text entering={SlideInRight.delay(index * 80).duration(OUTFIT_MOTION.transition).reduceMotion(ReduceMotion.System)} key={`${item}-${index}`} style={outfitStyles.outfitItem}>{item}</Animated.Text>)}</View>
      <Text style={outfitStyles.note}>{result.outfit_note}</Text>
      {!!result.layering_tip && <Text style={outfitStyles.layerTip}>{result.layering_tip}</Text>}
      {showRetry && onRetry && <Pressable accessibilityLabel="옷차림 추천 다시 시도" onPress={onRetry} style={outfitStyles.retry}><Text style={outfitStyles.retryText}>다시 시도</Text></Pressable>}
    </Animated.View>
  );
}

export function OutfitCardContainer({ enabled, event, sensitivity }: {
  enabled: boolean;
  event: CalendarEvent;
  sensitivity: OutfitSensitivity;
}) {
  const { result, retry, status } = useOutfitRecommendation({ enabled, event, sensitivity });
  if (!enabled || status === 'idle') return null;
  if (status === 'loading' && !result) return <OutfitSkeleton />;
  if (result) return <OutfitCard onRetry={retry} result={result} showRetry={status === 'error'} />;
  return (
    <View style={outfitStyles.empty}>
      <OutfitIcon activityType={event.activityType} size={25} />
      <Text style={outfitStyles.emptyText}>{status === 'unavailable' ? '날씨 데이터가 부족해 옷차림을 추천하기 어려워요.' : '옷차림 추천을 불러오지 못했어요.'}</Text>
      <Pressable accessibilityLabel="옷차림 추천 다시 시도" onPress={retry} style={outfitStyles.retry}><Text style={outfitStyles.retryText}>다시 시도</Text></Pressable>
    </View>
  );
}
