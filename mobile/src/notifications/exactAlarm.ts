import { requireOptionalNativeModule } from 'expo';
import { Alert, Platform } from 'react-native';

// Android '알람 및 리마인더' 권한(modules/exact-alarm). 없으면 일정 알림이 최대 1시간 늦게 울릴 수 있다. iOS·Expo Go에는 없어 허용된 것으로 본다.
const ExactAlarm = Platform.OS === 'android'
  ? requireOptionalNativeModule<{ canSchedule(): boolean; openSettings(): void }>('ExactAlarm')
  : null;

export const canScheduleExactAlarms = () => ExactAlarm?.canSchedule() ?? true;

// 일정 알림이 필요할 때(알림 시간을 고르거나 일정 알림을 켤 때) 권한이 없으면 묻는다. 거절해도 앱을 켤 때마다 한 번만 묻는다.
let askedThisRun = false;
export function askExactAlarmIfNeeded() {
  if (askedThisRun || canScheduleExactAlarms()) return;
  askedThisRun = true;
  Alert.alert('알림 시간 맞추기', "일정 알림을 정한 시간에 받으려면 '알람 및 리마인더'를 허용해 주세요. 허용하지 않으면 조금 늦게 올 수 있어요.", [
    { style: 'cancel', text: '나중에' },
    { onPress: () => ExactAlarm?.openSettings(), text: '허용하기' },
  ]);
}
