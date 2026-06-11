import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Pressable, Text, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { styles } from '../../styles/appStyles';
import type { BriefingMessage } from '../../types/dust';

// 챗봇 화면의 빠른 질문, 대화 목록, 입력창을 보여줍니다.
export function BriefingPanel({
  briefingInput,
  isBriefingLoading,
  messages,
  accentBorderTone,
  accentSoftTone,
  accentTone,
  onChangeInput,
  onInputFocus,
  onReset,
  onSendQuestion,
  region,
}: {
  briefingInput: string;
  isBriefingLoading: boolean;
  messages: BriefingMessage[];
  accentBorderTone: string;
  accentSoftTone: string;
  accentTone: string;
  onChangeInput: (text: string) => void;
  onInputFocus: () => void;
  onReset: () => void;
  onSendQuestion: (question: string, quickType?: string) => void;
  region: { city: string; region: string };
}) {
  const displayedMessages = messages.length
    ? messages
    : [{
      role: 'bot' as const,
      text: '궁금한 걸 편하게 물어보세요. 오늘 공기와 날씨, 내일 예측, 최근 변화, 앱 사용법까지 답해드릴게요.',
    }];

  const quickQuestions = [
    { label: '오늘 상태', question: '오늘 공기랑 날씨 어때?', quickType: 'today' },
    { label: '날씨', question: '지금 날씨랑 기온 알려줘', quickType: 'weather' },
    { label: '내일 예측', question: '내일은 어때?', quickType: 'tomorrow' },
    { label: '최근 비교', question: '지난주보다 좋아졌어?', quickType: 'period_compare' },
  ];

  return (
    <View style={styles.briefingChatCard}>
      <View style={styles.cardHeader}>
        <View style={styles.briefingHeaderTitleRow}>
          <View style={[styles.briefingHeaderIcon, { backgroundColor: accentSoftTone }]}>
            <Ionicons color={accentTone} name="chatbubble-ellipses-outline" size={19} />
          </View>
          <View>
            <Text style={styles.title}>챗봇</Text>
            <Text style={styles.homeBasisText}>{region.city} {region.region} 기준</Text>
          </View>
        </View>
        <Pressable disabled={messages.length === 0 && !briefingInput.trim()} onPress={onReset} style={({ pressed }) => [styles.briefingResetButton, pressed && styles.pressedFeedback]}>
          <Ionicons color="#687180" name="refresh-outline" size={15} />
          <Text style={styles.briefingResetText}>초기화</Text>
        </Pressable>
      </View>

      <View style={styles.quickPromptGrid}>
        {quickQuestions.map((item) => (
          <Pressable
            disabled={isBriefingLoading}
            key={item.quickType}
            onPress={() => onSendQuestion(item.question, item.quickType)}
            style={({ pressed }) => [styles.quickPromptButton, pressed && styles.pressedFeedback]}
          >
            <Text style={styles.quickPromptText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.briefingMessages}>
        {displayedMessages.map((message, index) => (
          <AnimatedBriefingBubble
            key={`${message.role}-${index}`}
            index={index}
            role={message.role}
            style={[
              styles.briefingBubble,
              message.role === 'user' ? styles.briefingBubbleUser : { borderColor: accentBorderTone },
            ]}
          >
            <BriefingMessageText role={message.role} text={message.text} />
          </AnimatedBriefingBubble>
        ))}
        {isBriefingLoading && (
          <AnimatedBriefingBubble index={displayedMessages.length} role="bot" style={[styles.briefingBubble, { borderColor: accentBorderTone }]}>
            <TypingDots />
          </AnimatedBriefingBubble>
        )}
      </View>

      <View style={[styles.briefingInputRow, { borderColor: accentBorderTone }]}>
        <TextInput
          value={briefingInput}
          onChangeText={onChangeInput}
          placeholder="예: 지금 공기랑 날씨 어때?"
          placeholderTextColor="#8a94a3"
          returnKeyType="send"
          style={styles.briefingInput}
          onFocus={onInputFocus}
          onSubmitEditing={() => onSendQuestion(briefingInput)}
        />
        <Pressable disabled={isBriefingLoading || !briefingInput.trim()} onPress={() => onSendQuestion(briefingInput)} style={({ pressed }) => [styles.briefingSendButton, { backgroundColor: accentTone }, pressed && styles.pressedFeedback]}>
          <Ionicons color="#ffffff" name="send" size={15} />
        </Pressable>
      </View>
    </View>
  );
}

function AnimatedBriefingBubble({
  children,
  index,
  role,
  style,
}: {
  children: ReactNode;
  index: number;
  role: BriefingMessage['role'];
  style: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const translateX = useRef(new Animated.Value(role === 'user' ? 8 : -8)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(8);
    translateX.setValue(role === 'user' ? 8 : -8);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        delay: Math.min(index, 3) * 35,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 18,
        stiffness: 210,
        useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        damping: 18,
        stiffness: 210,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, role, translateX, translateY]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateX }, { translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function BriefingMessageText({ role, text }: { role: BriefingMessage['role']; text: string }) {
  if (role === 'user') {
    return <Text style={[styles.briefingBubbleText, styles.briefingBubbleTextUser]}>{text}</Text>;
  }

  const pattern = /(매우 나쁨|나쁨|보통|좋음|PM10|PM2\.5|O3|NO2|미세먼지|초미세먼지|오존|이산화질소|날씨|기온|습도|풍속|풍향|강수량|비|눈|맑음|흐림|예측|현재|오늘|내일|모레|최근|지역|상세 데이터|즐겨찾기|알림|\d+(?:\.\d+)?\s?(?:µg\/m³|ppm|°C|°|%|m\/s|mm))/g;
  const parts = text.split(pattern).filter((part) => part.length > 0);

  return (
    <Text style={styles.briefingBubbleText}>
      {parts.map((part, index) => (
        <Text key={`${part}-${index}`} style={getBriefingHighlightStyle(part)}>
          {part}
        </Text>
      ))}
    </Text>
  );
}

function getBriefingHighlightStyle(part: string) {
  if (part === '좋음') return styles.briefingHighlightGood;
  if (part === '보통') return styles.briefingHighlightModerate;
  if (part.includes('나쁨')) return styles.briefingHighlightBad;
  if (/^\d/.test(part)) return styles.briefingHighlightValue;
  if (['PM10', 'PM2.5', 'O3', 'NO2', '미세먼지', '초미세먼지', '오존', '이산화질소', '날씨', '기온', '습도', '풍속', '풍향', '강수량', '비', '눈', '맑음', '흐림'].includes(part)) return styles.briefingHighlightMetric;
  if (['예측', '현재', '오늘', '내일', '모레', '최근'].includes(part)) return styles.briefingHighlightTime;
  if (['지역', '상세 데이터', '즐겨찾기', '알림'].includes(part)) return styles.briefingHighlightFeature;
  return undefined;
}

function TypingDots() {
  const dotOne = useRef(new Animated.Value(0.35)).current;
  const dotTwo = useRef(new Animated.Value(0.35)).current;
  const dotThree = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const createPulse = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.delay(240),
        ]),
      );
    const animations = [createPulse(dotOne, 0), createPulse(dotTwo, 140), createPulse(dotThree, 280)];
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dotOne, dotThree, dotTwo]);

  return (
    <View style={styles.typingDots}>
      {[dotOne, dotTwo, dotThree].map((opacity, index) => (
        <Animated.View key={index} style={[styles.typingDot, { opacity }]} />
      ))}
    </View>
  );
}
