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
export function ScreenTransition({ children, transitionKey }: { children: ReactNode; transitionKey: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useLayoutEffect(() => {
    opacity.setValue(0);
    translateY.setValue(10);
    const transition = Animated.parallel([
      Animated.timing(opacity, { duration: 180, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true }),
      Animated.timing(translateY, { duration: 220, easing: Easing.out(Easing.cubic), toValue: 0, useNativeDriver: true }),
    ]);
    transition.start();
    return () => transition.stop();
  }, [opacity, transitionKey, translateY]);

  return (
    <Animated.View style={[styles.screenTransition, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
