import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { styles } from '../../../styles/appStyles';

const notificationLeadOptions: Array<{ label: string; value: number | null }> = [
  { label: '\uC5C6\uC74C', value: null },
  { label: '30\uBD84 \uC804', value: 0.5 },
  { label: '1\uC2DC\uAC04 \uC804', value: 1 },
  { label: '3\uC2DC\uAC04 \uC804', value: 3 },
];

export function NotificationLeadSelector({
  accentSoftTone,
  accentTone,
  notificationHoursBefore,
  onChangeNotificationHoursBefore,
}: {
  accentSoftTone: string;
  accentTone: string;
  notificationHoursBefore?: number | null;
  onChangeNotificationHoursBefore: (value: number | null) => void;
}) {
  const isQuickOption = notificationLeadOptions.some((option) => option.value === notificationHoursBefore);
  const [showCustomInput, setShowCustomInput] = useState(typeof notificationHoursBefore === 'number' && !isQuickOption);
  const [customMinutes, setCustomMinutes] = useState(() => (
    typeof notificationHoursBefore === 'number' ? String(Math.max(1, Math.round(notificationHoursBefore * 60))) : '60'
  ));

  useEffect(() => {
    if (typeof notificationHoursBefore !== 'number') return;
    setCustomMinutes(String(Math.max(1, Math.round(notificationHoursBefore * 60))));
    if (!notificationLeadOptions.some((option) => option.value === notificationHoursBefore)) setShowCustomInput(true);
  }, [notificationHoursBefore]);

  const applyCustomMinutes = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 5);
    const minutes = Number(digits);
    const normalizedText = Number.isFinite(minutes) && minutes > 10080 ? '10080' : digits;
    setCustomMinutes(normalizedText);
    if (Number.isFinite(minutes) && minutes > 0) {
      onChangeNotificationHoursBefore(Math.min(minutes, 10080) / 60);
    }
  };

  return (
    <View style={styles.calendarActivityOptionGrid}>
      {notificationLeadOptions.map((option) => {
        const active = !showCustomInput && notificationHoursBefore === option.value;
        return (
          <Pressable
            key={option.value ?? 'none'}
            onPress={() => {
              setShowCustomInput(false);
              onChangeNotificationHoursBefore(option.value);
            }}
            style={({ pressed }) => [
              styles.calendarActivityOption,
              active && { backgroundColor: accentTone, borderColor: accentTone },
              pressed && styles.pressedFeedback,
            ]}
          >
            <Text style={[styles.calendarActivityOptionText, active && styles.calendarChipTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityLabel="알림 시간 직접 설정"
        accessibilityState={{ selected: showCustomInput }}
        onPress={() => {
          setShowCustomInput(true);
          const minutes = Math.max(1, Number(customMinutes) || 60);
          setCustomMinutes(String(minutes));
          onChangeNotificationHoursBefore(Math.min(minutes, 10080) / 60);
        }}
        style={({ pressed }) => [
          styles.calendarActivityOption,
          showCustomInput && { backgroundColor: accentTone, borderColor: accentTone },
          pressed && styles.pressedFeedback,
        ]}
      >
        <Text style={[styles.calendarActivityOptionText, showCustomInput && styles.calendarChipTextSelected]}>직접 설정</Text>
      </Pressable>
      {showCustomInput && (
        <View style={styles.calendarNotificationCustomRow}>
          <TextInput
            accessibilityLabel="일정 알림을 몇 분 전에 받을지 입력"
            keyboardType="number-pad"
            maxLength={5}
            onBlur={() => {
              if (Number(customMinutes) > 0) return;
              setCustomMinutes('60');
              onChangeNotificationHoursBefore(1);
            }}
            onChangeText={applyCustomMinutes}
            selectTextOnFocus
            style={[styles.calendarNotificationCustomInput, { borderColor: accentTone }]}
            value={customMinutes}
          />
          <Text style={styles.calendarNotificationCustomUnit}>분 전</Text>
          <Text style={styles.calendarNotificationCustomHint}>최대 7일 전까지 설정할 수 있어요</Text>
        </View>
      )}
    </View>
  );
}

