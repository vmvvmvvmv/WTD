import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { styles } from '../../../styles/appStyles';
import { textColors } from '../../../theme/bauhaus';
import type { CalendarEvent } from '../../../types/dust';

export type CalendarActivityInput = CalendarEvent['activityType'];

const activityOptions: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; value: CalendarActivityInput }> = [
  { icon: 'home-outline', label: '실내', value: 'indoor' },
  { icon: 'walk-outline', label: '실외', value: 'outdoor' },
];

export function ActivityTypeSelector({
  accentSoftTone,
  accentTone,
  activityInput,
  onChangeActivityInput,
}: {
  accentSoftTone: string;
  accentTone: string;
  activityInput: CalendarActivityInput;
  onChangeActivityInput: (value: CalendarActivityInput) => void;
}) {
  return (
    <View style={styles.calendarActivityOptionGrid}>
      {activityOptions.map((option) => {
        const active = activityInput === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChangeActivityInput(option.value)}
            style={({ pressed }) => [
              styles.calendarActivityOption,
              active && { backgroundColor: accentTone, borderColor: accentTone },
              pressed && styles.pressedFeedback,
            ]}
          >
            <Ionicons color={active ? '#ffffff' : textColors.secondary} name={option.icon} size={17} />
            <Text style={[styles.calendarActivityOptionText, active && styles.calendarChipTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

