import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, ImageBackground, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import { getWeatherVisualKind } from '../../utils/weather';

const HOME_WEATHER_BACKGROUNDS = {
  clear: require('../../../assets/weather-hero-banner.png'),
  cloudy: require('../../../assets/weather-hero-cloudy.png'),
  rain: require('../../../assets/weather-hero-rain.png'),
  snow: require('../../../assets/weather-hero-snow.png'),
} as const;

// 지도 화면 뒤에 깔리는 날씨 배경 그림.
export function WeatherBackdrop({ label }: { label?: string }) {
  return (
    <View pointerEvents="none" style={styles.weatherScreenBackdrop}>
      <ImageBackground
        source={HOME_WEATHER_BACKGROUNDS[getWeatherVisualKind(label)]}
        style={styles.weatherScreenBackdropImage}
        imageStyle={styles.weatherScreenBackdropImageStyle}
      />
    </View>
  );
}

// 탭을 바꿀 때 화면이 살짝 아래에서 떠오르며 나타납니다.
// 투명도는 건드리지 않는다. 0에서 시작하면 첫 프레임이 하얗게 비고, 안드로이드 새 아키텍처에서는
// native driver 투명도 애니메이션이 시작할 때 한 번 더 깜박여 홈 배너가 번쩍여 보였다(2026-10-23 실기기 녹화로 확인).
export function ScreenTransition({ children, transitionKey }: { children: ReactNode; transitionKey: string }) {
  const translateY = useRef(new Animated.Value(10)).current;

  useLayoutEffect(() => {
    translateY.setValue(10);
    const transition = Animated.timing(translateY, { duration: 220, easing: Easing.out(Easing.cubic), toValue: 0, useNativeDriver: true });
    transition.start();
    return () => transition.stop();
  }, [transitionKey, translateY]);

  return (
    <Animated.View style={[styles.screenTransition, { transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
