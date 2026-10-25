import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, Text } from 'react-native';

import { styles } from '../../styles/appStyles';

// 알림·즐겨찾기 결과 메시지를 하단에 잠깐 보여줍니다. 키보드가 열려 있으면 그 위로 올립니다.
// showId가 바뀌면 같은 문구라도 다시 띄운다.
export function BottomToast({ message, showId }: { message: string; showId: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const keyboardHeight = useKeyboardHeight();

  useEffect(() => {
    if (!message) return;
    opacity.stopAnimation();
    translateY.stopAnimation();
    opacity.setValue(0);
    translateY.setValue(16);
    Animated.parallel([
      Animated.timing(opacity, { duration: 160, toValue: 1, useNativeDriver: true }),
      Animated.spring(translateY, { damping: 18, stiffness: 180, toValue: 0, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { duration: 180, toValue: 0, useNativeDriver: true }),
        Animated.timing(translateY, { duration: 180, toValue: 12, useNativeDriver: true }),
      ]).start();
    }, 2200);
    return () => clearTimeout(timer);
  }, [message, showId, opacity, translateY]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.bottomToast, { bottom: keyboardHeight > 0 ? keyboardHeight + 24 : 88, opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.bottomToastText}>{message}</Text>
    </Animated.View>
  );
}

export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => setHeight(event.endCoordinates?.height ?? 0));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);
  return height;
}
