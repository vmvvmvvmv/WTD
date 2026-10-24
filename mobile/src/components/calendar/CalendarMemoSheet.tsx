import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiHttpError, postMemoEvents } from '../../api/dustEndpoints';
import { activityForecastLabel, activityWeatherKind } from '../../features/dashboard/homeActivityGuidePresenter';
import { useCalendarLocationForecasts } from '../../features/calendar/useCalendarLocationForecasts';
import { loadDeviceId } from '../../storage/appStorage';
import { styles as appStyles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import { bauhausColors, textColors } from '../../theme/bauhaus';
import { semanticColors } from '../../theme/semanticColors';
import type { CalendarEvent } from '../../types/calendar';
import { AppActionIcon } from '../shared/AppActionIcon';
import { useKeyboardHeight } from '../shared/BottomToast';
import { WeatherIcon } from '../shared/WeatherIcon';
import type { CalendarLocationForecast } from './calendarForecast';
import { memoEventToCalendarEvent } from './calendarMemo';
import type { CalendarRiskResult } from './calendarRiskEvaluator';
import { dayLabel } from './calendarUtils';

const MAX_LENGTH = 500;
const EXAMPLES = ['내일 3시 친구 약속', '토요일 아침 7시 러닝', '다음 주 월요일 2시 회의'];
const ACTIVITY_ICON = { indoor: 'activityIndoor', outdoor: 'activityOutdoor', transit: 'activityTransit' } as const;
const ACTIVITY_LABEL = { indoor: '실내', outdoor: '실외', transit: '이동' } as const;

function errorMessage(error: unknown) {
  if (error instanceof ApiHttpError) {
    if (error.status === 429) return '오늘은 다 썼어요. 내일 다시 써 주세요.';
    if (error.status === 503) return '지금은 쓸 수 없어요.';
  }
  return '일정으로 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.';
}

function timeRange(event: CalendarEvent) {
  const endDate = event.endDate ?? event.date;
  if (endDate !== event.date) return `${dayLabel(event.date)} ${event.time} ~ ${dayLabel(endDate)} ${event.endTime ?? ''}`.trim();
  return `${dayLabel(event.date)} · ${event.time}~${event.endTime ?? ''}`;
}

// AI가 일하는 동안 문구가 천천히 깜박입니다.
function ThinkingLabel() {
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { duration: 600, toValue: 0.45, useNativeDriver: true }),
      Animated.timing(opacity, { duration: 600, toValue: 1, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);
  return (
    <Animated.View style={[local.buttonRow, { opacity }]}>
      <Ionicons color="#ffffff" name="sparkles" size={16} />
      <Text style={local.primaryText}>일정 찾는 중…</Text>
    </Animated.View>
  );
}

function PreviewCard({ event, isSelected, onEdit, onToggle, risk }: {
  event: CalendarEvent;
  isSelected: boolean;
  onEdit: () => void;
  onToggle: () => void;
  risk?: CalendarRiskResult;
}) {
  const weatherLabel = risk ? activityForecastLabel(risk) : '';
  const placeLabel = event.location
    ? typeof event.locationLat === 'number' ? event.location : `${event.location} · 현재 지역 날씨로 봐요`
    : '';
  return (
    <View style={[local.card, !isSelected && local.cardOff]}>
      <Pressable
        accessibilityLabel={`${event.title} ${isSelected ? '선택됨' : '선택 안 됨'}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        hitSlop={10}
        onPress={onToggle}
        style={({ pressed }) => [local.check, isSelected && local.checkOn, pressed && appStyles.pressedFeedback]}
      >
        {isSelected && <Ionicons color="#ffffff" name="checkmark" size={16} />}
      </Pressable>
      <Pressable accessibilityHint="눌러서 고치기" onPress={onEdit} style={({ pressed }) => [local.cardBody, pressed && appStyles.pressedFeedback]}>
        <Text numberOfLines={1} style={local.cardTitle}>{event.title}</Text>
        <Text style={local.cardMeta}>{timeRange(event)}</Text>
        <View style={local.cardLine}>
          <AppActionIcon name={ACTIVITY_ICON[event.activityType]} size={16} />
          <Text numberOfLines={1} style={local.cardMeta}>{[ACTIVITY_LABEL[event.activityType], placeLabel].filter(Boolean).join(' · ')}</Text>
        </View>
        {!!weatherLabel && risk && (
          <View style={local.cardLine}>
            <WeatherIcon kind={activityWeatherKind(risk)} size={18} />
            <Text numberOfLines={1} style={local.cardWeather}>{weatherLabel}</Text>
          </View>
        )}
      </Pressable>
      <Ionicons color={textColors.muted} name="chevron-forward" size={18} />
    </View>
  );
}

// 메모를 AI로 일정 목록으로 바꾸고, 미리보기에서 고르고 고친 것만 추가합니다.
export function CalendarMemoSheet({ isOpen, onAdd, onClose, onEditEvent, riskByEvent, todayDateLabel }: {
  isOpen: boolean;
  onAdd: (events: CalendarEvent[]) => void;
  onClose: () => void;
  onEditEvent: (event: CalendarEvent, onSaved: () => void) => void;
  riskByEvent: (events: CalendarEvent[], forecasts: Record<string, CalendarLocationForecast>) => Record<string, CalendarRiskResult>;
  todayDateLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  // 안드로이드의 투명 모달은 키보드가 떠도 창이 줄지 않아서, 키보드 높이만큼 시트를 직접 올립니다.
  // 이때 알려 주는 키보드 높이에는 아래 내비게이션 영역이 빠져 있어 insets.bottom을 더합니다.
  const keyboardHeight = useKeyboardHeight();
  const [text, setText] = useState('');
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  // 미리보기 일정의 장소별 예보를 받아 날씨를 함께 보여 줍니다.
  const previewForecasts = useCalendarLocationForecasts(events ?? [], isOpen && !!events, todayDateLabel);
  const risks = useMemo(() => (events ? riskByEvent(events, previewForecasts) : {}), [events, previewForecasts, riskByEvent]);

  const close = () => {
    setEvents(null);
    setMessage('');
    onClose();
  };

  // 미리보기에서 뒤로 가기는 메모 고치기로 돌아갑니다.
  const handleRequestClose = () => {
    if (events) setEvents(null);
    else close();
  };

  const convert = async () => {
    if (!text.trim() || isLoading) return;
    setIsLoading(true);
    setMessage('');
    try {
      const response = await postMemoEvents({ deviceId: await loadDeviceId(), text: text.trim() });
      const next = (Array.isArray(response.events) ? response.events : []).map(memoEventToCalendarEvent);
      if (next.length === 0) {
        setMessage('메모에서 일정을 찾지 못했어요. 날짜나 시간을 함께 적어 주세요.');
        return;
      }
      setEvents(next);
      setSelectedIds(new Set(next.map((event) => event.id)));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const toggle = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const edit = (event: CalendarEvent) => {
    onEditEvent(event, () => {
      // 고쳐서 저장한 일정은 이미 추가됐으므로 미리보기에서 뺍니다. 남은 게 없으면 닫습니다.
      const remaining = (events ?? []).filter((item) => item.id !== event.id);
      if (remaining.length === 0) {
        setText('');
        close();
      } else setEvents(remaining);
    });
  };

  const add = () => {
    const picked = (events ?? []).filter((event) => selectedIds.has(event.id));
    if (picked.length === 0) return;
    onAdd(picked);
    setText('');
    close();
  };

  const appendExample = (example: string) => {
    setText((current) => (current.trim() ? `${current.trimEnd()}\n${example}` : example).slice(0, MAX_LENGTH));
    inputRef.current?.focus();
  };

  const selectedCount = events ? events.filter((event) => selectedIds.has(event.id)).length : 0;
  const canConvert = !!text.trim() && !isLoading;

  return (
    <Modal
      animationType="slide"
      // 모달이 화면에 뜬 뒤에 포커스해야 키보드가 올라옵니다(autoFocus는 모달 안에서 무시됨).
      onShow={() => setTimeout(() => inputRef.current?.focus(), 80)}
      onRequestClose={handleRequestClose}
      navigationBarTranslucent
      statusBarTranslucent
      transparent
      visible={isOpen}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[local.root, Platform.OS === 'android' && keyboardHeight > 0 && { paddingBottom: keyboardHeight + insets.bottom }]}>
        <Pressable accessibilityLabel="AI로 정리 닫기" onPress={close} style={local.backdrop} />
        <View style={[local.sheet, { paddingBottom: keyboardHeight > 0 ? 16 : Math.max(16, insets.bottom + 10) }]}>
          <View style={local.handle} />
          <View style={local.header}>
            <Text style={local.title}>{events ? '이렇게 추가할까요?' : 'AI로 정리'}</Text>
            <Pressable accessibilityLabel="닫기" hitSlop={10} onPress={close} style={({ pressed }) => pressed && appStyles.pressedFeedback}>
              <Ionicons color={textColors.secondary} name="close" size={26} />
            </Pressable>
          </View>
          <Text style={local.subtitle}>
            {events ? '카드를 누르면 고칠 수 있어요.' : '날짜·시간·장소를 대충 적으면 AI가 일정으로 정리해요.'}
          </Text>

          {events ? (
            <ScrollView contentContainerStyle={local.list} style={local.listScroll}>
              {events.map((event) => (
                <PreviewCard
                  event={event}
                  isSelected={selectedIds.has(event.id)}
                  key={event.id}
                  onEdit={() => edit(event)}
                  onToggle={() => toggle(event.id)}
                  risk={risks[event.id]}
                />
              ))}
            </ScrollView>
          ) : (
            <>
              <View style={local.inputBox}>
                <TextInput
                  editable={!isLoading}
                  maxLength={MAX_LENGTH}
                  multiline
                  onChangeText={setText}
                  placeholder="예) 내일 3시 강남역 친구 만남"
                  placeholderTextColor={textColors.disabled}
                  ref={inputRef}
                  style={local.input}
                  textAlignVertical="top"
                  value={text}
                />
                <Text style={local.counter}>{`${text.length}/${MAX_LENGTH}`}</Text>
              </View>
              <ScrollView contentContainerStyle={local.chips} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
                {EXAMPLES.map((example) => (
                  <Pressable disabled={isLoading} key={example} onPress={() => appendExample(example)} style={({ pressed }) => [local.chip, pressed && appStyles.pressedFeedback]}>
                    <Text style={local.chipText}>{example}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={local.notice}>
                <Ionicons color={textColors.muted} name="lock-closed-outline" size={13} />
                <Text style={local.noticeText}>Google AI로 보내 정리해요 · 메모는 저장하지 않아요</Text>
              </View>
            </>
          )}

          {!!message && <Text style={local.message}>{message}</Text>}

          <View style={local.actions}>
            {events ? (
              <>
                <Pressable onPress={() => setEvents(null)} style={({ pressed }) => [local.secondary, pressed && appStyles.pressedFeedback]}>
                  <Text style={local.secondaryText}>메모 고치기</Text>
                </Pressable>
                <Pressable
                  disabled={selectedCount === 0}
                  onPress={add}
                  style={({ pressed }) => [local.primary, local.primaryFlex, selectedCount === 0 && local.disabled, pressed && appStyles.pressedFeedback]}
                >
                  <Text style={local.primaryText}>{selectedCount > 0 ? `${selectedCount}개 추가` : '고른 일정 없음'}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                disabled={!canConvert}
                onPress={convert}
                style={({ pressed }) => [local.primary, local.primaryFlex, !text.trim() && local.disabled, pressed && appStyles.pressedFeedback]}
              >
                {isLoading ? <ThinkingLabel /> : (
                  <View style={local.buttonRow}>
                    <Ionicons color="#ffffff" name="sparkles" size={16} />
                    <Text style={local.primaryText}>일정 만들기</Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const local = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  backdrop: { backgroundColor: 'rgba(15, 20, 30, 0.45)', flex: 1 },
  buttonRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  card: { alignItems: 'center', backgroundColor: bauhausColors.white, borderColor: bauhausColors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  cardBody: { flex: 1, gap: 4 },
  cardLine: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  cardMeta: { color: textColors.secondary, flexShrink: 1, fontSize: 13, fontWeight: '600' },
  cardOff: { opacity: 0.5 },
  cardTitle: { color: textColors.heading, fontSize: 16, fontWeight: '800' },
  cardWeather: { color: textColors.primary, flexShrink: 1, fontSize: 13, fontWeight: '700' },
  check: { alignItems: 'center', borderColor: bauhausColors.border, borderRadius: 999, borderWidth: 2, height: 26, justifyContent: 'center', width: 26 },
  checkOn: { backgroundColor: accentTone, borderColor: accentTone },
  chip: { backgroundColor: bauhausColors.blueSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { color: accentTone, fontSize: 13, fontWeight: '700' },
  chips: { gap: 8, paddingVertical: 10 },
  counter: { alignSelf: 'flex-end', color: textColors.muted, fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  handle: { alignSelf: 'center', backgroundColor: bauhausColors.border, borderRadius: 3, height: 5, marginBottom: 14, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  input: { color: textColors.primary, fontSize: 16, fontWeight: '600', lineHeight: 24, maxHeight: 200, minHeight: 96, padding: 0 },
  inputBox: { backgroundColor: '#f5f7fa', borderRadius: 16, marginTop: 14, paddingHorizontal: 14, paddingBottom: 8, paddingTop: 12 },
  list: { gap: 10, paddingVertical: 14 },
  listScroll: { maxHeight: 420 },
  message: { color: semanticColors.weather.caution.tone, fontSize: 13, fontWeight: '700', marginTop: 8 },
  notice: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  noticeText: { color: textColors.muted, fontSize: 12, fontWeight: '600' },
  primary: { alignItems: 'center', backgroundColor: accentTone, borderRadius: 999, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18 },
  primaryFlex: { flex: 1 },
  primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  root: { flex: 1, justifyContent: 'flex-end' },
  secondary: { alignItems: 'center', backgroundColor: bauhausColors.white, borderColor: bauhausColors.border, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18 },
  secondaryText: { color: textColors.secondary, fontSize: 15, fontWeight: '700' },
  sheet: { backgroundColor: bauhausColors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10 },
  subtitle: { color: textColors.secondary, fontSize: 14, fontWeight: '600', marginTop: 4 },
  title: { color: textColors.heading, fontSize: 21, fontWeight: '900' },
});
