import { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

// 일·주·월·년 보기가 같이 쓰는 넘김 동작: 제목이 바뀌면 옆에서 밀려 들어오고, 좌우로 밀면 한 칸 이동합니다.
export function useCalendarSlide(title: string, direction: number, onMove: (offset: number) => void) {
  const progress = useRef(new Animated.Value(1)).current;
  const hasMountedRef = useRef(false);

  useEffect(() => {
    // 화면을 처음 열 때는 화면 전환 애니메이션만 쓰고, 넘길 때만 밀어 넣습니다.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, { duration: 210, toValue: 1, useNativeDriver: true }).start();
  }, [progress, title]);

  const animatedStyle = {
    opacity: progress,
    transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [18 * direction, 0] }) }],
  };

  const swipeHandlers = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      Math.abs(gesture.dx) > 18
      && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4
    ),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) < 48) return;
      onMove(gesture.dx > 0 ? -1 : 1);
    },
  }).panHandlers, [onMove]);

  return { animatedStyle, swipeHandlers };
}
