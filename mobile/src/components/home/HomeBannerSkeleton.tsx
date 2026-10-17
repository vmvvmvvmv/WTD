import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { styles } from '../../styles/appStyles';

const FORECAST_PLACEHOLDER_COUNT = 5;

// 지역을 바꿔 새 데이터를 기다리는 동안 홈 배너 자리에 같은 모양의 회색 뼈대를 보여줍니다.
// 빛은 왼쪽에서 오른쪽으로 아주 약하게만 지나가고, "움직임 줄이기"를 켜면 회색 뼈대만 남습니다.
export function HomeBannerSkeleton({ bannerHeight, reduceMotion }: { bannerHeight: number; reduceMotion: boolean }) {
  const [width, setWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion || width === 0) return;
    const animation = Animated.loop(
      Animated.timing(sweep, { duration: 1400, easing: Easing.inOut(Easing.quad), toValue: 1, useNativeDriver: true }),
    );
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, sweep, width]);
  return (
    <View
      accessibilityLabel="지역 데이터를 불러오는 중입니다"
      accessible
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.homeHeroBanner, styles.homeHeroBannerBottom, styles.homeSkeleton]}
    >
      <View style={[styles.homeSkeletonBlock, styles.homeSkeletonBanner, { height: bannerHeight }]} />
      <View style={styles.homeSkeletonForecastRow}>
        {Array.from({ length: FORECAST_PLACEHOLDER_COUNT }, (_, index) => (
          <View key={index} style={[styles.homeSkeletonBlock, styles.homeSkeletonForecastItem]} />
        ))}
      </View>
      <View style={[styles.homeSkeletonBlock, styles.homeSkeletonOutingRow]} />
      {!reduceMotion && width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.homeSkeletonSweep,
            { width: width * 0.35, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.35, width] }) }] },
          ]}
        />
      )}
    </View>
  );
}
