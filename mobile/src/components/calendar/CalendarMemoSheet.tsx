import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiHttpError, postMemoEvents } from '../../api/dustEndpoints';
import { activityForecastLabel, activityWeatherKind } from '../../features/dashboard/homeActivityGuidePresenter';
import { useCalendarLocationForecasts } from '../../features/calendar/useCalendarLocationForecasts';
import { loadDeviceId, loadMemoHistory, saveMemoHistory } from '../../storage/appStorage';
import { styles as appStyles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import { bauhausColors, textColors } from '../../theme/bauhaus';
import { semanticColors } from '../../theme/semanticColors';
import type { CalendarEvent } from '../../types/calendar';
import { AppActionIcon } from '../shared/AppActionIcon';
import { useKeyboardHeight } from '../shared/BottomToast';
import { WeatherIcon } from '../shared/WeatherIcon';
import type { CalendarLocationForecast } from './calendarForecast';
import { isRepeatMemo, memoEventToCalendarEvent, memoSuggestions, withMemoHistory } from './calendarMemo';
import type { CalendarRiskResult } from './calendarRiskEvaluator';
import { dayLabel } from './calendarUtils';

const MAX_LENGTH = 500;
const CAUTIONS = [
  '연락처·주소 같은 개인정보와 병원 같은 민감한 단어는 가려서 보내지만, 모두 가려지지는 않아요.',
  'AI가 날짜나 시간을 잘못 읽을 수 있어요. 추가 전에 꼭 확인하세요.',
];
// 주의사항 첫 줄은 연한 빨간색으로 강조합니다(경고 빨강 #E05263보다 연하게).
const CAUTION_TONE = '#EE8C97';
const ACTIVITY_ICON = { indoor: 'activityIndoor', outdoor: 'activityOutdoor', transit: 'activityTransit' } as const;
const ACTIVITY_LABEL = { indoor: '실내', outdoor: '실외', transit: '이동' } as const;

function errorMessage(error: unknown) {
  if (error instanceof ApiHttpError) {
    if (error.status === 429) return '오늘은 다 썼어요. 내일 다시 써 주세요.';
    // 503: AI 설정이 없거나, 앱 전체가 함께 쓰는 AI 한도가 찬 경우.
    if (error.status === 503) return '지금 AI 사용량이 많아요. 잠시 뒤 다시 하거나 직접 일정 등록을 써 주세요.';
  }
  return '일정으로 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.';
}

function timeRange(event: CalendarEvent) {
  const endDate = event.endDate ?? event.date;
  if (endDate !== event.date) return `${dayLabel(event.date)} ${event.time} ~ ${dayLabel(endDate)} ${event.endTime ?? ''}`.trim();
  return `${dayLabel(event.date)} · ${event.time}~${event.endTime ?? ''}`;
}

// 일정을 찾는 동안 문구가 천천히 깜박입니다.
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
      <Text style={local.primaryText}>AI가 일정 찾는 중…</Text>
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

// 메모를 일정 목록으로 바꾸고(서버의 AI), 미리보기에서 고르고 고친 것만 추가합니다.
export function CalendarMemoSheet({ calendarEvents, isOpen, onAdd, onClose, onEditEvent, riskByEvent, todayDateLabel }: {
  calendarEvents: CalendarEvent[];
  isOpen: boolean;
  onAdd: (events: CalendarEvent[]) => void;
  onClose: () => void;
  onEditEvent: (event: CalendarEvent, onSaved: () => void) => void;
  riskByEvent: (events: CalendarEvent[], forecasts: Record<string, CalendarLocationForecast>) => Record<string, CalendarRiskResult>;
  todayDateLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  // 안드로이드의 투명 모달은 키보드가 떠도 창이 줄지 않아서, 키보드 높이만큼 시트를 직접 올립니다.
  // 이때 알려 주는 키보드 높이에는 아래 내비게이션 영역이 빠져 있어 insets.bottom을 더합니다.
  const keyboardHeight = useKeyboardHeight();
  const [text, setText] = useState('');
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showCautions, setShowCautions] = useState(false);
  // 전에 적은 메모(이 휴대폰에만 저장). 입력칸 아래 칩으로 보여 주고, 누르면 다시 쓸 수 있습니다.
  const [memoHistory, setMemoHistory] = useState<string[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    loadMemoHistory().then((history) => {
      if (!cancelled) setMemoHistory(history);
    });
    return () => { cancelled = true; };
  }, [isOpen]);
  // 요청마다 번호를 매겨, 닫았거나 새로 보낸 뒤에 도착한 예전 응답은 버립니다(다시 열었을 때 옛 미리보기가 뜨지 않게).
  const requestIdRef = useRef(0);
  const isConvertingRef = useRef(false);
  // 같은 미리보기를 두 번 추가하지 않게 합니다(빠르게 두 번 누르면 화면이 바뀌기 전에 두 번 불림).
  const isAddedRef = useRef(false);
  // 미리보기 일정의 장소별 예보를 받아 날씨를 함께 보여 줍니다.
  const previewForecasts = useCalendarLocationForecasts(events ?? [], isOpen && !!events, todayDateLabel);
  const risks = useMemo(() => (events ? riskByEvent(events, previewForecasts) : {}), [events, previewForecasts, riskByEvent]);

  const close = () => {
    requestIdRef.current += 1;
    isConvertingRef.current = false;
    setIsLoading(false);
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
    // 상태(isLoading)는 다음 화면에서야 바뀌므로, 빠른 연속 누름은 ref로 막습니다(사용 횟수를 두 번 쓰지 않게).
    if (!text.trim() || isConvertingRef.current) return;
    // 반복 일정은 한 번짜리로 잘못 만들어지므로 보내지 않고 직접 등록으로 안내합니다.
    if (isRepeatMemo(text)) {
      setMessage('반복 일정은 직접 일정 등록에서 반복을 골라 만들어 주세요.');
      return;
    }
    isConvertingRef.current = true;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setMessage('');
    try {
      const response = await postMemoEvents({ deviceId: await loadDeviceId(), text: text.trim() });
      if (requestId !== requestIdRef.current) return;
      const next = (Array.isArray(response.events) ? response.events : []).map(memoEventToCalendarEvent);
      if (next.length === 0) {
        setMessage('메모에서 일정을 찾지 못했어요. 날짜나 시간을 함께 적어 주세요.');
        return;
      }
      isAddedRef.current = false;
      const history = withMemoHistory(memoHistory, text);
      setMemoHistory(history);
      void saveMemoHistory(history);
      setEvents(next);
      setSelectedIds(new Set(next.map((event) => event.id)));
    } catch (error) {
      if (requestId === requestIdRef.current) setMessage(errorMessage(error));
    } finally {
      if (requestId === requestIdRef.current) {
        isConvertingRef.current = false;
        setIsLoading(false);
      }
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
    if (picked.length === 0 || isAddedRef.current) return;
    isAddedRef.current = true;
    onAdd(picked);
    setText('');
    close();
  };

  const removeHistory = (memo: string) => {
    const next = memoHistory.filter((item) => item !== memo);
    setMemoHistory(next);
    void saveMemoHistory(next);
  };

  const appendExample = (example: string) => {
    setText((current) => (current.trim() ? `${current.trimEnd()}\n${example}` : example).slice(0, MAX_LENGTH));
    inputRef.current?.focus();
  };

  const suggestions = useMemo(() => memoSuggestions(calendarEvents), [calendarEvents]);
  const chipItems = memoHistory.length ? memoHistory : suggestions;
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
        <Pressable accessibilityLabel="AI 일정 등록 닫기" onPress={close} style={local.backdrop} />
        <View
          style={[local.sheet, {
            // 키보드가 올라와도 제목·닫기 버튼이 상태 표시줄 밑으로 밀려 올라가지 않게 높이를 화면 안으로 묶고, 가운데 내용은 스크롤합니다.
            maxHeight: window.height - insets.top - 8 - (Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0),
            paddingBottom: keyboardHeight > 0 ? 16 : Math.max(16, insets.bottom + 10),
          }]}
        >
          <View style={local.handle} />
          <View style={local.header}>
            <Text style={local.title}>{events ? '이렇게 추가할까요?' : 'AI 일정 등록'}</Text>
            <Pressable accessibilityLabel="닫기" hitSlop={10} onPress={close} style={({ pressed }) => pressed && appStyles.pressedFeedback}>
              <Ionicons color={textColors.secondary} name="close" size={26} />
            </Pressable>
          </View>
          {!!events && <Text style={local.subtitle}>확인하고, 다르면 카드를 눌러 고치세요.</Text>}

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
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={local.inputScroll}>
              <View style={local.inputBox}>
                <TextInput
                  editable={!isLoading}
                  maxLength={MAX_LENGTH}
                  multiline
                  onChangeText={setText}
                  placeholder="날짜·시간·장소를 적어 주세요
예) 내일 3시 강남역 친구 만남"
                  placeholderTextColor={textColors.disabled}
                  ref={inputRef}
                  style={local.input}
                  textAlignVertical="top"
                  value={text}
                />
                {text.length > MAX_LENGTH - 100 && <Text style={local.counter}>{`${text.length}/${MAX_LENGTH}`}</Text>}
              </View>
              {chipItems.length > 0 && (
              <ScrollView contentContainerStyle={local.chips} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
                {/* 전에 적은 메모가 먼저, 없으면 자주 쓴 일정. 둘 다 없으면 칩 줄을 보이지 않습니다(기본 예시는 두지 않음). */}
                {chipItems.map((example) => (
                  <View key={example} style={local.chipWrap}>
                    <Pressable disabled={isLoading} onPress={() => appendExample(example)} style={({ pressed }) => [local.chip, memoHistory.length > 0 && local.chipWithRemove, pressed && appStyles.pressedFeedback]}>
                      <Text numberOfLines={1} style={local.chipText}>{example.replace(/\s*\n\s*/g, ' · ')}</Text>
                    </Pressable>
                    {/* 전에 적은 메모만 지울 수 있습니다(자주 쓴 일정·예시는 저장된 기록이 아님). */}
                    {memoHistory.length > 0 && (
                      <Pressable
                        accessibilityLabel={`${example} 기록 지우기`}
                        hitSlop={8}
                        onPress={() => removeHistory(example)}
                        style={({ pressed }) => [local.chipRemove, pressed && appStyles.pressedFeedback]}
                      >
                        <Ionicons color={accentTone} name="close" size={14} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </ScrollView>
              )}
              {/* AI로 보내기 전 주의사항은 한 줄로 두고, 누르면 펼쳐 봅니다. 서버도 개인정보와 민감한 단어를 가려서 보냅니다. */}
              <Pressable
                accessibilityHint="눌러서 주의사항 보기"
                accessibilityRole="button"
                accessibilityState={{ expanded: showCautions }}
                hitSlop={6}
                onPress={() => setShowCautions((current) => !current)}
                style={local.notice}
              >
                <Ionicons color={CAUTION_TONE} name="lock-closed-outline" size={13} />
                <Text style={[local.noticeText, local.noticeStrong]}>Google AI로 정리합니다. 민감한 개인정보는 적지 마세요.</Text>
                <Ionicons color={CAUTION_TONE} name={showCautions ? 'chevron-up' : 'chevron-down'} size={14} />
              </Pressable>
              {showCautions && CAUTIONS.map((caution) => (
                <View key={caution} style={local.cautionRow}>
                  <Text style={local.noticeBullet}>·</Text>
                  <Text style={local.cautionText}>{caution}</Text>
                </View>
              ))}
            </ScrollView>
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
                    <Text style={local.primaryText}>AI로 일정 만들기</Text>
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
  chip: { backgroundColor: bauhausColors.blueSoft, borderRadius: 999, maxWidth: 240, paddingHorizontal: 12, paddingVertical: 6 },
  // 기록 칩: 글자 부분과 × 부분을 한 알약 모양으로 붙입니다.
  chipRemove: { alignItems: 'center', backgroundColor: bauhausColors.blueSoft, borderBottomRightRadius: 999, borderTopRightRadius: 999, justifyContent: 'center', paddingLeft: 2, paddingRight: 10 },
  chipWithRemove: { borderBottomRightRadius: 0, borderTopRightRadius: 0, paddingRight: 6 },
  chipWrap: { flexDirection: 'row' },
  chipText: { color: accentTone, fontSize: 13, fontWeight: '700' },
  chips: { gap: 8, paddingVertical: 12 },
  counter: { alignSelf: 'flex-end', color: textColors.muted, fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  handle: { alignSelf: 'center', backgroundColor: bauhausColors.border, borderRadius: 3, height: 5, marginBottom: 14, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  inputScroll: { flexShrink: 1 },
  input: { color: textColors.primary, fontSize: 16, fontWeight: '600', lineHeight: 24, maxHeight: 200, minHeight: 80, padding: 0 },
  inputBox: { backgroundColor: '#f5f7fa', borderRadius: 16, marginTop: 14, paddingHorizontal: 14, paddingBottom: 8, paddingTop: 12 },
  list: { gap: 10, paddingVertical: 14 },
  listScroll: { flexShrink: 1, maxHeight: 420 },
  message: { color: semanticColors.weather.caution.tone, fontSize: 13, fontWeight: '700', marginTop: 8 },
  cautionRow: { flexDirection: 'row', gap: 5, marginTop: 4, paddingLeft: 18 },
  cautionText: { color: textColors.muted, flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  notice: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  noticeBullet: { color: textColors.muted, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  noticeStrong: { color: CAUTION_TONE, fontWeight: '600' },
  noticeText: { color: textColors.muted, flexShrink: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  primary: { alignItems: 'center', backgroundColor: accentTone, borderRadius: 999, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18 },
  primaryFlex: { flex: 1 },
  primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  root: { flex: 1, justifyContent: 'flex-end' },
  secondary: { alignItems: 'center', backgroundColor: bauhausColors.white, borderColor: bauhausColors.border, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18 },
  secondaryText: { color: textColors.secondary, fontSize: 15, fontWeight: '700' },
  sheet: { backgroundColor: bauhausColors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10 },
  subtitle: { color: textColors.secondary, fontSize: 14, fontWeight: '600', marginTop: 4 },
  title: { color: textColors.heading, fontSize: 18, fontWeight: '900' },
});
