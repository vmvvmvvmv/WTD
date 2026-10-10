import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Text, View } from 'react-native';

import { styles } from '../../styles/appStyles';

// 지역이 바뀔 때 홈 위에 잠깐 띄우는 "불러오는 중" 카드의 상태와 애니메이션.
export function useRegionTransition() {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  const start = () => {
    opacity.stopAnimation();
    scale.stopAnimation();
    opacity.setValue(0);
    scale.setValue(0.98);
    setIsTransitioning(true);
    Animated.parallel([
      Animated.timing(opacity, { duration: 160, toValue: 1, useNativeDriver: true }),
      Animated.spring(scale, { damping: 16, stiffness: 180, toValue: 1, useNativeDriver: true }),
    ]).start();
  };

  const finish = () => {
    Animated.timing(opacity, { duration: 220, toValue: 0, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setIsTransitioning(false);
    });
  };

  return { finish, isTransitioning, opacity, scale, start };
}

export function RegionLoadingOverlay({ accentTone, opacity, scale, title }: {
  accentTone: string;
  opacity: Animated.Value;
  scale: Animated.Value;
  title: string;
}) {
  return (
    <Animated.View pointerEvents="none" style={[styles.regionLoadingOverlay, { opacity, transform: [{ scale }] }]}>
      <View style={styles.regionLoadingCard}>
        <ActivityIndicator color={accentTone} />
        <Text style={styles.regionLoadingTitle}>{title}</Text>
        <Text style={styles.regionLoadingText}>지역 데이터를 불러오는 중입니다.</Text>
      </View>
    </Animated.View>
  );
}
