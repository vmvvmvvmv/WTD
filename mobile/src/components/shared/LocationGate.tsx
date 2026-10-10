import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { styles } from '../../styles/appStyles';

// 아직 기준 지역이 없을 때(첫 실행·위치 권한 대기) 보여주는 화면.
export function LocationGate({ isLocating, message, onRetry }: { isLocating: boolean; message: string; onRetry: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.locationGate}>
        <ActivityIndicator color="#2fbf71" size="large" />
        <Text style={styles.locationGateTitle}>현재 위치를 확인하고 있어요</Text>
        <Text style={styles.locationGateText}>{message || '위치 권한을 허용하면 지금 있는 지역으로 앱을 시작합니다.'}</Text>
        <Pressable disabled={isLocating} onPress={onRetry} style={({ pressed }) => [styles.locationGateButton, pressed && styles.pressedFeedback]}>
          <Text style={styles.locationGateButtonText}>{isLocating ? '확인 중' : '위치 권한 다시 요청'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
