import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiHttpError, postMemoEvents, type MemoEvent } from '../../api/dustEndpoints';
import { loadDeviceId } from '../../storage/appStorage';
import { styles as appStyles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import { bauhausColors, textColors } from '../../theme/bauhaus';
import type { CalendarEvent } from '../../types/calendar';
import { memoEventToCalendarEvent } from './calendarMemo';
import { dayLabel } from './calendarUtils';

const MAX_LENGTH = 500;

function errorMessage(error: unknown) {
  if (error instanceof ApiHttpError) {
    if (error.status === 429) return '오늘은 다 썼어요. 내일 다시 써 주세요.';
    if (error.status === 503) return '지금은 쓸 수 없어요.';
  }
  return '일정으로 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.';
}

function timeRange(item: MemoEvent) {
  if (item.end_date !== item.date) return `${dayLabel(item.date)} ${item.time} ~ ${dayLabel(item.end_date)} ${item.end_time}`;
  return `${dayLabel(item.date)} ${item.time}~${item.end_time}`;
}

// 메모를 AI로 일정 목록으로 바꾸고, 미리보기에서 확인한 것만 추가합니다.
export function CalendarMemoSheet({ isOpen, onAdd, onClose }: {
  isOpen: boolean;
  onAdd: (events: CalendarEvent[]) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [items, setItems] = useState<MemoEvent[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const close = () => {
    setItems(null);
    setMessage('');
    onClose();
  };

  const convert = async () => {
    if (!text.trim() || isLoading) return;
    setIsLoading(true);
    setMessage('');
    try {
      const response = await postMemoEvents({ deviceId: await loadDeviceId(), text: text.trim() });
      const events = Array.isArray(response.events) ? response.events : [];
      setItems(events);
      if (events.length === 0) setMessage('메모에서 일정을 찾지 못했어요.');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const add = () => {
    if (!items?.length) return;
    onAdd(items.map(memoEventToCalendarEvent));
    setText('');
    close();
  };

  const showPreview = !!items?.length;

  return (
    <Modal animationType="slide" visible={isOpen} onRequestClose={close}>
      <View style={appStyles.calendarSheetBackdrop}>
        <View style={[appStyles.calendarEditorHeader, { minHeight: 64 + insets.top, paddingTop: Math.max(12, insets.top) }]}>
          <Pressable accessibilityLabel="메모로 추가 닫기" onPress={close} style={({ pressed }) => [appStyles.calendarEditorHeaderButton, pressed && appStyles.pressedFeedback]}>
            <Ionicons color="#141821" name="close" size={32} />
          </Pressable>
          <Text style={appStyles.calendarEditorHeaderTitle}>메모로 추가</Text>
          <View style={appStyles.calendarEditorHeaderButton} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={local.content} keyboardShouldPersistTaps="handled">
            {showPreview ? (
              <>
                <Text style={local.hint}>AI가 정리했어요. 확인하고 추가하세요.</Text>
                {items.map((item, index) => (
                  <View key={`${item.date}-${item.time}-${index}`} style={local.item}>
                    <View style={local.itemBody}>
                      <Text style={local.itemTitle}>{item.title}</Text>
                      <Text style={local.itemMeta}>{timeRange(item)}</Text>
                      {!!(item.place?.label || item.place_text) && (
                        <Text style={local.itemMeta}>{item.place?.label || `${item.place_text} · 위치 못 찾음`}</Text>
                      )}
                    </View>
                    <Pressable
                      accessibilityLabel={`${item.title} 빼기`}
                      hitSlop={8}
                      onPress={() => setItems((current) => current?.filter((_, itemIndex) => itemIndex !== index) ?? null)}
                      style={({ pressed }) => pressed && appStyles.pressedFeedback}
                    >
                      <Ionicons color={textColors.muted} name="close-circle" size={24} />
                    </Pressable>
                  </View>
                ))}
              </>
            ) : (
              <TextInput
                autoFocus
                maxLength={MAX_LENGTH}
                multiline
                onChangeText={setText}
                placeholder={'예) 내일 3시 강남역 친구 만남\n토요일 아침 7시 한강 러닝'}
                placeholderTextColor="#8a94a3"
                style={local.input}
                textAlignVertical="top"
                value={text}
              />
            )}
            {!!message && <Text style={local.message}>{message}</Text>}
          </ScrollView>

          <View style={[local.actions, { paddingBottom: Math.max(18, insets.bottom + 12) }]}>
            {showPreview ? (
              <>
                <Pressable onPress={add} style={({ pressed }) => [local.primary, pressed && appStyles.pressedFeedback]}>
                  <Text style={local.primaryText}>{`${items.length}개 추가`}</Text>
                </Pressable>
                <Pressable onPress={() => setItems(null)} style={({ pressed }) => [local.secondary, pressed && appStyles.pressedFeedback]}>
                  <Text style={local.secondaryText}>다시 쓰기</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                disabled={!text.trim() || isLoading}
                onPress={convert}
                style={({ pressed }) => [local.primary, (!text.trim() || isLoading) && local.disabled, pressed && appStyles.pressedFeedback]}
              >
                {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text style={local.primaryText}>일정 만들기</Text>}
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  actions: { gap: 10, paddingHorizontal: 18, paddingTop: 10 },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 6 },
  disabled: { backgroundColor: textColors.disabled },
  hint: { color: textColors.secondary, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { color: textColors.primary, fontSize: 17, fontWeight: '600', lineHeight: 26, minHeight: 180 },
  item: { alignItems: 'center', borderBottomColor: bauhausColors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 14 },
  itemBody: { flex: 1, gap: 3 },
  itemMeta: { color: textColors.secondary, fontSize: 14, fontWeight: '600' },
  itemTitle: { color: textColors.heading, fontSize: 17, fontWeight: '800' },
  message: { color: textColors.secondary, fontSize: 14, fontWeight: '600', marginTop: 12 },
  primary: { alignItems: 'center', backgroundColor: accentTone, borderRadius: 999, justifyContent: 'center', minHeight: 52 },
  primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  secondary: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: bauhausColors.border, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 48 },
  secondaryText: { color: textColors.secondary, fontSize: 15, fontWeight: '700' },
});
