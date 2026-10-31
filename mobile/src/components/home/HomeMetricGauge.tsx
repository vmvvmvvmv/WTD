// 홈 배너의 게이지 슬라이드: 자리마다 굴러가는 숫자와 처음 들어올 때 한 번 차오르는 호.
import { ActivityIndicator, Animated, Easing, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useEffect, useRef } from 'react';

import { styles } from '../../styles/appStyles';

type HomeCircularGaugeProps = {
  gaugeSize?: number;
  large?: boolean;
  progress: number;
  unit: string;
  value: string;
};

// 게이지 원 안에 숫자가 들어가도록 글자 크기를 줄입니다. 원 안쪽 폭의 약 70%를 쓰고,
// 숫자 한 자는 글자 크기의 0.6배, 소수점·쉼표는 그 절반 정도 폭으로 셉니다.
function gaugeValueFontSize(value: string, size: number, baseFontSize: number) {
  const narrow = (value.match(/[.,:]/g) ?? []).length;
  const units = Math.max(1, value.length - narrow * 0.6);
  return Math.max(12, Math.min(baseFontSize, Math.floor((size * 0.7) / (units * 0.6))));
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// 숫자 한 자리를 0~9가 세로로 쌓인 띠로 그리고, 값이 바뀌면 띠를 굴려 새 숫자로 옮깁니다.
// 처음 그릴 때는 굴리지 않습니다(0부터 차오르면 가짜 숫자처럼 보임).
function HomeRollingDigit({ animate, digit, fontSize, lineHeight, style }: {
  animate: boolean;
  digit: number;
  fontSize: number;
  lineHeight: number;
  style: object;
}) {
  const position = useRef(new Animated.Value(digit)).current;
  useEffect(() => {
    if (!animate) {
      position.setValue(digit);
      return;
    }
    const animation = Animated.timing(position, { duration: 500, easing: Easing.out(Easing.cubic), toValue: digit, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [animate, digit, position]);
  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: Animated.multiply(position, -lineHeight) }] }}>
        {DIGITS.map((d) => (
          <Text key={d} allowFontScaling={false} style={[style, { fontSize, fontVariant: ['tabular-nums'], height: lineHeight, includeFontPadding: false, lineHeight, marginTop: 0, textAlignVertical: 'center' }]}>{d}</Text>
        ))}
      </Animated.View>
    </View>
  );
}

// 게이지 가운데 값. 숫자는 자리마다 따로 굴러가고 '-' '.' 같은 글자는 그대로 둡니다.
// 자리는 오른쪽부터 맞춰서, 21 → 9처럼 자릿수가 줄어도 일의 자리는 이어서 굴러갑니다.
function HomeRollingValue({ animate, fontSize, lineHeight, style, value }: {
  animate: boolean;
  fontSize: number;
  lineHeight: number;
  style: object;
  value: string;
}) {
  const chars = value.split('');
  return (
    <View accessible accessibilityLabel={value} style={{ flexDirection: 'row' }}>
      {chars.map((char, index) => {
        const place = chars.length - index;
        return /\d/.test(char)
          ? <HomeRollingDigit key={`d${place}`} animate={animate} digit={Number(char)} fontSize={fontSize} lineHeight={lineHeight} style={style} />
          : <Text key={`s${place}`} allowFontScaling={false} style={[style, { fontSize, height: lineHeight, includeFontPadding: false, lineHeight, marginTop: 0, textAlignVertical: 'center' }]}>{char}</Text>;
      })}
    </View>
  );
}

function HomeCircularGauge({ animate, gaugeSize, large = false, pending = false, progress, revealed, unit, value }: HomeCircularGaugeProps & {
  animate: boolean;
  pending?: boolean;
  revealed: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const size = gaugeSize ?? (large ? 132 : 62);
  const stroke = large ? 10 : 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * 0.78;
  const safeProgress = Math.max(0.04, Math.min(1, progress));
  // 슬라이드가 처음 화면에 들어오기 전에는 비워 두고, 들어오면 값까지 한 번 차오릅니다. 그 뒤로 값이 바뀌면 이전 값에서 이어서 움직입니다.
  const targetProgress = revealed && !pending ? safeProgress : 0;
  const shownProgress = useRef(new Animated.Value(0)).current;
  // 값을 받아오는 동안(pending)은 짧은 호가 원을 따라 돌아 기다리는 중임을 보여 줍니다.
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pending || !animate) {
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(spin, { duration: 1100, easing: Easing.linear, toValue: 1, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [animate, pending, spin]);
  useEffect(() => {
    if (!animate) {
      shownProgress.setValue(targetProgress);
      return;
    }
    const animation = Animated.timing(shownProgress, { duration: 600, easing: Easing.out(Easing.cubic), toValue: targetProgress, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [animate, shownProgress, targetProgress]);
  const baseFontSize = large ? gaugeValueFontSize(String(value), size, 38) : 11;
  // 굴러가는 띠의 높이를 글자 높이와 정확히 맞추려고 글자 확대는 직접 계산합니다(원래처럼 최대 1.2배).
  const textScale = Math.min(fontScale, 1.2);
  const valueFontSize = baseFontSize * textScale;
  const valueLineHeight = Math.round(baseFontSize * 1.1 * textScale);
  return (
    <View style={styles.homeCircularGauge}>
      <View style={[styles.homeCircularGaugeCircle, large && styles.homeCircularGaugeCircleLarge, { height: size, width: size }]}>
        <Svg height={size} width={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="rgba(255,255,255,0.34)"
            strokeDasharray={`${arc} ${circumference}`}
            strokeLinecap="round"
            strokeWidth={stroke}
            transform={`rotate(130 ${size / 2} ${size / 2})`}
          />
          {!pending && <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="#ffffff"
            strokeDasharray={`${arc} ${circumference}`}
            strokeDashoffset={shownProgress.interpolate({ inputRange: [0, 1], outputRange: [arc, 0] })}
            strokeLinecap="round"
            strokeWidth={stroke}
            transform={`rotate(130 ${size / 2} ${size / 2})`}
          />}
        </Svg>
        {pending && (
          <Animated.View pointerEvents="none" style={{ height: size, left: 0, position: 'absolute', top: 0, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }], width: size }}>
            <Svg height={size} width={size} viewBox={`0 0 ${size} ${size}`}>
              <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke="#ffffff" strokeDasharray={`${circumference * 0.18} ${circumference}`} strokeLinecap="round" strokeWidth={stroke} />
            </Svg>
          </Animated.View>
        )}
        <View style={styles.homeCircularGaugeCenter}>
          <View style={{ marginTop: 1 }}>
            {pending ? <ActivityIndicator accessibilityLabel="불러오는 중" color="#ffffff" size="small" /> : <HomeRollingValue
              animate={animate}
              fontSize={valueFontSize}
              lineHeight={valueLineHeight}
              style={[styles.homeCircularGaugeValue, large && styles.homeCircularGaugeValueLarge]}
              value={String(value)}
            />}
          </View>
          {!pending && <Text style={[styles.homeCircularGaugeUnit, large && styles.homeCircularGaugeUnitLarge]}>{unit}</Text>}
        </View>
      </View>
    </View>
  );
}

export function HomeInfoGaugeSlide({ animate, comparison, gaugeSize, pending, progress, revealed, slideHeight, status, title, tone, unit, value, width }: {
  animate: boolean;
  pending?: boolean;
  revealed: boolean;
  comparison: string;
  gaugeSize: number;
  label: string;
  progress: number;
  slideHeight: number;
  status: string;
  title: string;
  tone: string;
  unit: string;
  value: string;
  width: number;
}) {
  return (
    <View style={[styles.homeInfoSlide, styles.homeSplitGaugeSlide, { height: slideHeight, width }]}>
      <View style={[styles.homeSplitGaugeVisual, { width: gaugeSize + 4 }]}>
        <HomeCircularGauge animate={animate} gaugeSize={gaugeSize} large pending={pending} progress={progress} revealed={revealed} unit={unit} value={value} />
      </View>
      <View style={styles.homeSplitGaugeInfo}>
        <Text maxFontSizeMultiplier={1.2} numberOfLines={2} style={styles.homeInfoSlideTitle}>{title}</Text>
        <View style={styles.homeSplitGaugeStatusRow}>
          <View style={[styles.homeSplitGaugeStatusDot, { backgroundColor: tone }]} />
          <Text maxFontSizeMultiplier={1.2} style={styles.homeSplitGaugeStatus}>{status}</Text>
        </View>
        <Text maxFontSizeMultiplier={1.2} numberOfLines={2} style={styles.homeInfoSlideComparison}>{comparison}</Text>
      </View>
    </View>
  );
}
