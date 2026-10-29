import { Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';

import { styles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import { AppActionIcon } from '../shared/AppActionIcon';

const MAP_PREVIEW_MIN_HEIGHT = 156;
const MAP_PREVIEW_BOTTOM_RESERVE = 44 + 8;

// 홈 '날씨 지도' 탭: 지도 미리보기(실패하면 최대 3번 다시 불러옴). 누르면 전체 지도로 갑니다.
export function HomeMapPreview({ active, mapPreviewUrl, onOpenMap, tabBarTop }: { active: boolean; mapPreviewUrl: string; onOpenMap: () => void; tabBarTop?: number }) {
  // 지도 탭을 열면 지도가 하단 탭 바 바로 위까지 닿도록, 화면에서 지도가 시작하는 위치를 재서 높이를 정합니다.
  const mapPaneRef = useRef<View>(null);
  const [mapFrameHeight, setMapFrameHeight] = useState(MAP_PREVIEW_MIN_HEIGHT);
  const measureMapPane = useCallback(() => {
    if (tabBarTop === undefined) return;
    mapPaneRef.current?.measureInWindow((_x, y) => {
      setMapFrameHeight(Math.max(MAP_PREVIEW_MIN_HEIGHT, Math.round(tabBarTop - y - MAP_PREVIEW_BOTTOM_RESERVE)));
    });
  }, [tabBarTop]);
  useEffect(() => {
    if (active) measureMapPane();
  }, [active, measureMapPane]);
  const [mapPreviewFailed, setMapPreviewFailed] = useState(false);
  const [mapPreviewRetryCount, setMapPreviewRetryCount] = useState(0);
  useEffect(() => {
    setMapPreviewFailed(false);
    setMapPreviewRetryCount(0);
  }, [mapPreviewUrl]);
  useEffect(() => {
    if (!mapPreviewFailed || mapPreviewRetryCount >= 3) return;
    const retryDelays = [1200, 3000, 6000];
    const timer = setTimeout(() => {
      setMapPreviewFailed(false);
      setMapPreviewRetryCount((count) => count + 1);
    }, retryDelays[mapPreviewRetryCount]);
    return () => clearTimeout(timer);
  }, [mapPreviewFailed, mapPreviewRetryCount]);
  return (
    <Pressable
      accessibilityLabel={"전국 지도 날씨 보러가기"}
      onLayout={active ? measureMapPane : undefined}
      onPress={onOpenMap}
      ref={mapPaneRef}
      style={({ pressed }) => [!active && styles.homeSectionHidden, pressed && styles.pressedFeedback]}
    >
      <View style={[styles.homeMapPreviewFrame, { height: mapFrameHeight }]} pointerEvents="none">
        {mapPreviewFailed || !mapPreviewUrl ? (
          <View style={styles.homeMapPreviewFallback}>
            <AppActionIcon name="map" size={37} />
            <Text style={styles.homeMapPreviewFallbackText}>지도를 불러올 수 없어요</Text>
          </View>
        ) : (
          <WebView
            key={`${mapPreviewUrl}-${mapPreviewRetryCount}`}
            source={{ uri: mapPreviewUrl }}
            javaScriptEnabled
            domStorageEnabled
            androidLayerType="hardware"
            mixedContentMode="always"
            onLoad={() => {
              setMapPreviewFailed(false);
            }}
            onError={() => setMapPreviewFailed(true)}
            onHttpError={() => setMapPreviewFailed(true)}
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            thirdPartyCookiesEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            style={styles.homeMapPreviewWebView}
          />
        )}
      </View>
      <View style={styles.homeMapPreviewFooter}>
        <Text style={[styles.homeMapPreviewLink, { color: accentTone }]}>{"전국 지도 날씨 보러가기"}</Text>
        <Ionicons color={accentTone} name="chevron-forward" size={17} />
      </View>
    </Pressable>
  );
}
