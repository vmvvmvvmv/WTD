import { Switch, Text, View } from 'react-native';

import { styles } from '../../styles/appStyles';

// 설정 탭에서 반복해서 쓰는 알림 토글 행입니다.
export function NotificationToggleRow({ accentTone, description, disabled, label, onValueChange, value }: {
  accentTone: string;
  // 스위치가 무엇을 하는지 알려주는 회색 한 줄(선택).
  description?: string;
  disabled?: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={[styles.notificationRow, disabled && styles.notificationRowDisabled]}>
      <View style={styles.notificationLabelGroup}>
        <Text style={styles.notificationLabel}>{label}</Text>
        {!!description && <Text style={styles.notificationDescription}>{description}</Text>}
      </View>
      <Switch
        accessibilityLabel={description ? `${label}. ${description}` : label}
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={value ? '#ffffff' : '#f8f9fa'}
        trackColor={{ false: '#d9dee5', true: accentTone }}
        value={value}
      />
    </View>
  );
}
