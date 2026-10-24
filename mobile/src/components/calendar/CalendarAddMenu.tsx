import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles as appStyles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import { bauhausColors, textColors } from '../../theme/bauhaus';

function Option({ description, icon, onPress, title }: {
  description: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable accessibilityLabel={`${title}. ${description}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [local.option, pressed && appStyles.pressedFeedback]}>
      <View style={local.optionIcon}>
        <Ionicons color={accentTone} name={icon} size={22} />
      </View>
      <View style={local.optionBody}>
        <Text style={local.optionTitle}>{title}</Text>
        <Text style={local.optionDescription}>{description}</Text>
      </View>
      <Ionicons color={textColors.muted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

// 일정 추가(+)를 누르면 직접 입력과 AI로 정리 중에서 고릅니다.
export function CalendarAddMenu({ isOpen, onClose, onDirect, onMemo }: {
  isOpen: boolean;
  onClose: () => void;
  onDirect: () => void;
  onMemo: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible={isOpen}>
      <View style={local.root}>
        <Pressable accessibilityLabel="일정 추가 닫기" onPress={onClose} style={local.backdrop} />
        <View style={[local.sheet, { paddingBottom: Math.max(18, insets.bottom + 12) }]}>
          <View style={local.handle} />
          <Text style={local.title}>일정 추가</Text>
          <Option description="날짜·시간·장소를 골라요" icon="create-outline" onPress={onDirect} title="직접 입력" />
          <Option description="“내일 3시 강남역 약속”처럼 적으면 돼요" icon="sparkles" onPress={onMemo} title="AI로 정리" />
        </View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(15, 20, 30, 0.45)', flex: 1 },
  handle: { alignSelf: 'center', backgroundColor: bauhausColors.border, borderRadius: 3, height: 5, marginBottom: 14, width: 38 },
  option: { alignItems: 'center', borderColor: bauhausColors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 14, marginTop: 10, paddingHorizontal: 16, paddingVertical: 14 },
  optionBody: { flex: 1, gap: 3 },
  optionDescription: { color: textColors.secondary, fontSize: 13, fontWeight: '600' },
  optionIcon: { alignItems: 'center', backgroundColor: bauhausColors.blueSoft, borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  optionTitle: { color: textColors.heading, fontSize: 16, fontWeight: '800' },
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: bauhausColors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10 },
  title: { color: textColors.heading, fontSize: 21, fontWeight: '900', marginBottom: 4 },
});
