import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';

import type { SearchNear } from '../../features/places/naverPlaces';
import { searchPlacesNear } from '../../features/places/placeSearch';
import { AppActionIcon, type AppActionIconName } from '../shared/AppActionIcon';
import { styles } from '../../styles/appStyles';
import { textColors } from '../../theme/bauhaus';
import { compareDateTime, dayLabel, formatDate, parseDateParts } from './calendarUtils';
import type { CalendarLocationCandidate } from './calendarLocation';
import type { CalendarRepeatMode } from './calendarRepeat';
import { ActivityTypeSelector, type CalendarActivityInput } from './editor/ActivityTypeSelector';
import { DateTimePicker } from './editor/DateTimePicker';
import { NotificationLeadSelector } from './editor/NotificationLeadSelector';
import { RepeatSelector } from './editor/RepeatSelector';
import { accentTone } from '../../theme/appTheme';

const defaultActivityGuides: Record<CalendarActivityInput, { desc: string; icon: AppActionIconName; title: string }> = {
  indoor: {
    desc: '실내 일정이라도 가는 길의 공기는 확인해 보세요.',
    icon: 'activityIndoor',
    title: '실내 활동 가이드',
  },
  outdoor: {
    desc: '나가기 전에 비, 기온, 미세먼지를 확인해 보세요.',
    icon: 'activityOutdoor',
    title: '실외 활동 가이드',
  },
  transit: {
    desc: '출발할 때 날씨와 공기 상태를 확인해 보세요.',
    icon: 'activityTransit',
    title: '이동 활동 가이드',
  },
};

type Props = {
  activityInput: CalendarActivityInput;
  endDate: string;
  endTime: string;
  isRepeatLocked?: boolean;
  isOpen: boolean;
  location?: string;
  mapPickerUrl?: string;
  memo: string;
  onChangeEndDate: (value: string) => void;
  onChangeEndTime: (value: string) => void;
  onChangeLocation: (value: string) => void;
  onChangeNotificationHoursBefore: (value: number | null) => void;
  onChangeSelectedLocation?: (value: CalendarLocationCandidate | null) => void;
  onChangeMemo: (value: string) => void;
  onChangeActivityInput: (value: CalendarActivityInput) => void;
  onChangeRepeatEndDate: (value: string) => void;
  onChangeRepeatMode: (value: CalendarRepeatMode) => void;
  onChangeRepeatWeekdays: (value: number[]) => void;
  onChangeStartDate: (value: string) => void;
  onChangeStartTime: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  repeatEndDate: string;
  repeatMode: CalendarRepeatMode;
  repeatWeekdays: number[];
  notificationHoursBefore?: number | null;
  startDate: string;
  startTime: string;
  title: string;
};

export function CalendarEventEditor({
  activityInput,
  endDate,
  endTime,
  isRepeatLocked = false,
  isOpen,
  location,
  mapPickerUrl,
  memo,
  onChangeEndDate,
  onChangeEndTime,
  onChangeLocation,
  onChangeNotificationHoursBefore,
  onChangeSelectedLocation,
  onChangeMemo,
  onChangeActivityInput,
  onChangeRepeatEndDate,
  onChangeRepeatMode,
  onChangeRepeatWeekdays,
  onChangeStartDate,
  onChangeStartTime,
  onChangeTitle,
  onClose,
  onSave,
  repeatEndDate,
  repeatMode,
  repeatWeekdays,
  notificationHoursBefore,
  startDate,
  startTime,
  title,
}: Props) {
  const insets = useSafeAreaInsets();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [isMapPickerSearchOpen, setIsMapPickerSearchOpen] = useState(false);
  const [mapPickerSearchMessage, setMapPickerSearchMessage] = useState('');
  const [mapPickerSearchResults, setMapPickerSearchResults] = useState<CalendarLocationCandidate[]>([]);
  const [mapPickerSearchText, setMapPickerSearchText] = useState('');
  const [pendingLocation, setPendingLocation] = useState<CalendarLocationCandidate | null>(null);
  // 지도를 움직이는 동안 가운데 핀을 살짝 띄웁니다. 멈추면 내려앉고 그 자리 주소가 아래 카드에 뜹니다.
  const [isMapMoving, setIsMapMoving] = useState(false);
  const pinLift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pinLift, { friction: 6, tension: 120, toValue: isMapMoving ? 1 : 0, useNativeDriver: true }).start();
  }, [isMapMoving, pinLift]);
  const mapPickerWebViewRef = useRef<WebViewType>(null);
  // 지금 지도 가운데 좌표(지도가 멈출 때마다 갱신). 검색 결과를 여기서 가까운 순으로 보여 줍니다.
  // 가운데 주소의 시·도와 동 이름도 두어, 흔한 이름이라 먼 결과만 나오면 이 지역 이름을 붙여 다시 찾습니다.
  const mapPickerCenterRef = useRef<SearchNear | null>(null);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardOpen(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardOpen(false);
      setIsMapPickerSearchOpen(false);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (compareDateTime(startDate, '00:00', repeatEndDate, '00:00') > 0) {
      onChangeRepeatEndDate(formatDate(parseDateParts(startDate).year, parseDateParts(startDate).month, parseDateParts(startDate).day));
    }
  }, [onChangeRepeatEndDate, repeatEndDate, startDate]);

  const mapPickerSource = mapPickerUrl ? `${mapPickerUrl}${mapPickerUrl.includes('?') ? '&' : '?'}picker=1` : '';

  useEffect(() => {
    if (!isMapPickerOpen || !isMapPickerSearchOpen) return;
    const query = mapPickerSearchText.trim();
    if (query.length < 1) {
      setMapPickerSearchResults([]);
      setMapPickerSearchMessage('');
      return;
    }
    // 홈·지도 지역 검색과 같은 방식: 친 검색어 그대로 찾고, 결과가 모두 지도 가운데서 멀면 그 지역 이름을 붙여 다시 찾은 뒤 가까운 순으로.
    let cancelled = false;
    setMapPickerSearchResults([]);
    setMapPickerSearchMessage('검색 중입니다.');
    const timer = setTimeout(async () => {
      let results: CalendarLocationCandidate[] = [];
      try {
        results = (await searchPlacesNear(query, mapPickerCenterRef.current))
          .map((place) => ({ ...place, source: 'naver_local' } satisfies CalendarLocationCandidate));
        if (cancelled) return;
        setMapPickerSearchResults(results);
        setMapPickerSearchMessage(results.length === 0 ? '찾는 장소가 없습니다. 다른 이름이나 주소로 찾아보세요.' : '');
      } catch {
        if (!cancelled) {
          setMapPickerSearchResults(results);
          setMapPickerSearchMessage(results.length === 0 ? '검색 연결을 확인해주세요.' : '');
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isMapPickerOpen, isMapPickerSearchOpen, mapPickerSearchText]);

  useEffect(() => {
    if (!isMapPickerOpen) return;
    mapPickerWebViewRef.current?.injectJavaScript(`
      if (typeof window.setPickerSearchResults === 'function') {
        window.setPickerSearchResults(${JSON.stringify(mapPickerSearchResults)});
      }
      true;
    `);
  }, [isMapPickerOpen, mapPickerSearchResults]);

  const applyPickedLocation = (candidate: CalendarLocationCandidate) => {
    onChangeLocation(candidate.label);
    onChangeSelectedLocation?.(candidate);
    setPendingLocation(null);
    setIsMapPickerOpen(false);
    Keyboard.dismiss();
  };

  const focusMapPickerPlace = (place: CalendarLocationCandidate) => {
    Keyboard.dismiss();
    setIsMapPickerSearchOpen(false);
    setMapPickerSearchText(place.label);
    mapPickerWebViewRef.current?.injectJavaScript(`
      if (typeof window.focusStation === 'function') {
        window.focusStation(${JSON.stringify({ ...place, name: place.label })});
      }
      true;
    `);
  };

  const handleMapPickerMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        location?: Partial<CalendarLocationCandidate>;
        station?: Record<string, unknown>;
        type?: string;
      };
      if (payload.type === 'map-moving') {
        setIsMapMoving(true);
        return;
      }
      if ((payload.type === 'map-picked' || payload.type === 'map-place-selected') && payload.location) {
        setIsMapMoving(false);
        // 지도가 멈출 때마다 오는 가운데 주소(naver_map)로는 검색창·키보드를 닫지 않습니다. 키보드가 열리며 지도 크기가 바뀌어도 닫히지 않게.
        if (payload.location.source !== 'naver_map') {
          setIsMapPickerSearchOpen(false);
          Keyboard.dismiss();
        }
        const lat = typeof payload.location.lat === 'number' ? payload.location.lat : undefined;
        const lng = typeof payload.location.lng === 'number' ? payload.location.lng : undefined;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        const address = typeof payload.location.address === 'string' ? payload.location.address : undefined;
        const city = typeof payload.location.city === 'string' ? payload.location.city : undefined;
        const region = typeof payload.location.region === 'string' ? payload.location.region : undefined;
        const link = typeof payload.location.link === 'string' ? payload.location.link : undefined;
        const fallbackLabel = typeof payload.location.label === 'string' ? payload.location.label : '';
        const label = payload.location.source === 'naver_local' && fallbackLabel
          ? fallbackLabel
          : address || region || fallbackLabel || '지도 선택 위치';
        const candidate: CalendarLocationCandidate = {
          address,
          city,
          label,
          lat,
          lng,
          link,
          region,
          source: payload.location.source || 'naver_map',
        };
        if (candidate.source === 'naver_map') mapPickerCenterRef.current = { areaName: [city, region].filter(Boolean).join(' ') || undefined, lat, lng };
        // 검색 결과에서 고른 장소는 업종을 되살려 간략 정보에 보여 줍니다(지도에서 오는 값엔 업종이 없음).
        const match = candidate.source === 'naver_local'
          ? mapPickerSearchResults.find((place) => place.label === candidate.label && Math.abs(place.lat - lat) < 0.0003 && Math.abs(place.lng - lng) < 0.0003)
          : undefined;
        const picked = match ? { ...candidate, category: match.category } : candidate;
        // 지도 위 검색 마커를 누르면 바로 정하지 않고, 그 장소로 지도를 옮겨 아래에 간략 정보만 띄웁니다.
        if (payload.type === 'map-place-selected') focusMapPickerPlace(match ?? picked);
        else setPendingLocation(picked);
      }
      if (payload.type === 'station-selected' && payload.station) {
        const station = payload.station;
        const lat = typeof station.lat === 'number' ? station.lat : undefined;
        const lng = typeof station.lng === 'number' ? station.lng : undefined;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        const name = typeof station.name === 'string' ? station.name : '';
        const city = typeof station.city === 'string' ? station.city : '';
        const sido = typeof station.sido === 'string' ? station.sido : '';
        setPendingLocation({
          address: typeof station.addr === 'string' ? station.addr : undefined,
          city: sido || undefined,
          label: name || city || '지도 선택 위치',
          lat,
          lng,
          region: city || name || undefined,
          source: 'station',
        });
      }
    } catch {
      // Ignore messages that are not picker payloads.
    }
  };

  const handleRequestClose = () => {
    if (isKeyboardOpen) {
      Keyboard.dismiss();
      return;
    }
    onClose();
  };

  return (
    <Modal animationType="slide" visible={isOpen} onRequestClose={handleRequestClose}>
      <View style={styles.calendarSheetBackdrop}>
        <View style={[styles.calendarEditorHeader, { minHeight: 64 + insets.top, paddingTop: Math.max(12, insets.top) }]}>
          <Pressable accessibilityLabel="일정 입력 닫기" onPress={onClose} style={({ pressed }) => [styles.calendarEditorHeaderButton, pressed && styles.pressedFeedback]}>
            <Ionicons color="#141821" name="close" size={32} />
          </Pressable>
          <Text style={styles.calendarEditorHeaderTitle}>일정</Text>
          <View style={styles.calendarEditorHeaderButton} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.calendarSheetKeyboardArea}>
          <ScrollView contentContainerStyle={styles.calendarSheetScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.calendarSheetScroll}>
            <View style={styles.calendarSheet}>
            <View style={styles.calendarSheetTitleRow}>
              <View style={[styles.calendarColorDot, { backgroundColor: accentTone }]} />
              <TextInput
                multiline
                onChangeText={onChangeTitle}
                placeholder="일정을 입력하세요."
                placeholderTextColor="#8a94a3"
                style={styles.calendarSheetTitleInput}
                value={title}
              />
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={styles.calendarSheetDateTimeBlock}>
              <DateTimePicker
                endDate={endDate}
                endTime={endTime}
                onChangeEndDate={onChangeEndDate}
                onChangeEndTime={onChangeEndTime}
                onChangeStartDate={onChangeStartDate}
                onChangeStartTime={onChangeStartTime}
                startDate={startDate}
                startTime={startTime}
              />
            </View>
            <View style={styles.calendarSheetDivider} />
            <View pointerEvents={isRepeatLocked ? 'none' : 'auto'} style={[styles.calendarSheetRow, isRepeatLocked && styles.calendarSheetRowLocked]}>
              <Ionicons color="#8a94a3" name="repeat-outline" size={20} />
              <RepeatSelector
                onChangeRepeatEndDate={onChangeRepeatEndDate}
                onChangeRepeatMode={onChangeRepeatMode}
                onChangeRepeatWeekdays={onChangeRepeatWeekdays}
                repeatEndDate={repeatEndDate}
                repeatMode={repeatMode}
                repeatWeekdays={repeatWeekdays}
                startDate={startDate}
              />
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={styles.calendarSheetRow}>
              <Ionicons color="#8a94a3" name="compass-outline" size={20} />
              <ActivityTypeSelector
                activityInput={activityInput}
                onChangeActivityInput={onChangeActivityInput}
              />
            </View>
            <View style={styles.calendarDefaultGuide}>
              <View style={styles.calendarDefaultGuideIcon}>
                <AppActionIcon name={defaultActivityGuides[activityInput].icon} size={31} />
              </View>
              <View style={styles.calendarDefaultGuideTextGroup}>
                <Text style={styles.calendarDefaultGuideTitle}>{defaultActivityGuides[activityInput].title}</Text>
                <Text style={styles.calendarDefaultGuideDesc}>{defaultActivityGuides[activityInput].desc}</Text>
              </View>
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={styles.calendarSheetRow}>
              <AppActionIcon name="notification" size={24} />
              <NotificationLeadSelector
                notificationHoursBefore={notificationHoursBefore}
                onChangeNotificationHoursBefore={onChangeNotificationHoursBefore}
              />
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={styles.calendarSheetRow}>
              <AppActionIcon name="location" size={24} />
              {!!mapPickerSource && (
                <Pressable
                  accessibilityLabel={location ? `장소 ${location}, 지도에서 바꾸기` : '지도에서 장소 선택'}
                  onPress={() => {
                    Keyboard.dismiss();
                    setPendingLocation(null);
                    setIsMapMoving(false);
                    setMapPickerSearchText('');
                    setMapPickerSearchResults([]);
                    setIsMapPickerSearchOpen(false);
                    setIsMapPickerOpen(true);
                  }}
                  style={({ pressed }) => [styles.calendarSheetRowAction, pressed && styles.pressedFeedback]}
                >
                  {/* 고른 장소가 있으면 그 이름을 보여 줍니다. 없으면 고르라는 안내. */}
                  <Text numberOfLines={2} style={styles.calendarSheetRowText}>{location || '지도에서 장소 선택'}</Text>
                  <AppActionIcon name="map" size={25} />
                </Pressable>
              )}
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={[styles.calendarSheetRow, styles.calendarMemoRow]}>
              <Ionicons color="#8a94a3" name="document-text-outline" size={20} />
              <TextInput
                multiline
                onChangeText={onChangeMemo}
                placeholder="메모"
                placeholderTextColor="#8a94a3"
                style={[styles.calendarSheetTextInput, styles.calendarMemoInput]}
                textAlignVertical="top"
                value={memo}
              />
            </View>
            </View>
          </ScrollView>
          {/* 하단 바: 왼쪽엔 일정 요약(첫 줄 시간, 둘째 줄 날짜·장소), 오른쪽엔 알약 버튼 '저장'. 지도 선택의 아래 칸과 같은 모양입니다. 제목이 비어 있으면 저장을 막습니다. */}
          <View style={[styles.calendarMapPickerConfirmBar, styles.calendarEditorBottomBar, { paddingBottom: isKeyboardOpen ? 10 : Math.max(12, insets.bottom + 8) }]}>
            <View style={styles.calendarMapPickerConfirmTextGroup}>
              <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={styles.calendarMapPickerConfirmTitle}>
                {startTime} ~ {endDate !== startDate ? `${dayLabel(endDate)} ` : ''}{endTime}
              </Text>
              <Text numberOfLines={1} style={styles.calendarMapPickerConfirmMeta}>
                {[dayLabel(startDate), location].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Pressable
              disabled={!title.trim()}
              onPress={onSave}
              style={({ pressed }) => [
                styles.calendarMapPickerConfirmButton,
                { backgroundColor: title.trim() ? accentTone : textColors.disabled },
                pressed && title.trim() && styles.pressedFeedback,
              ]}
            >
              <Text style={[styles.calendarMapPickerConfirmButtonText, styles.calendarEditorSaveText]}>저장</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
        <Modal
          animationType="slide"
          visible={isMapPickerOpen}
          // 검색 키보드가 열려 있으면 뒤로 가기는 키보드만 닫습니다.
          onRequestClose={() => (Keyboard.isVisible() ? Keyboard.dismiss() : setIsMapPickerOpen(false))}
        >
          <View style={styles.calendarMapPickerBackdrop}>
            <View style={[styles.calendarMapPickerHeader, { paddingTop: Math.max(12, insets.top) }]}>
              <Pressable accessibilityLabel="지도 선택 닫기" onPress={() => setIsMapPickerOpen(false)} style={({ pressed }) => [styles.calendarEditorHeaderButton, pressed && styles.pressedFeedback]}>
                <Ionicons color="#141821" name="close" size={30} />
              </Pressable>
              <View style={styles.calendarMapPickerTitleGroup}>
                <Text style={styles.calendarEditorHeaderTitle}>지도에서 선택</Text>
              </View>
              <View style={styles.calendarEditorHeaderButton} />
            </View>
            <View style={styles.calendarMapPickerSearchWrap}>
              <View style={styles.calendarMapPickerSearchBar}>
                <AppActionIcon name="search" size={23} />
                <TextInput
                  onChangeText={(text) => {
                    setMapPickerSearchText(text);
                    setIsMapPickerSearchOpen(!!text.trim());
                  }}
                  onBlur={() => setTimeout(() => setIsMapPickerSearchOpen(false), 120)}
                  onSubmitEditing={() => {
                    setIsMapPickerSearchOpen(false);
                    Keyboard.dismiss();
                  }}
                  placeholder="장소, 주소, 지역 검색"
                  placeholderTextColor="#8a94a3"
                  returnKeyType="search"
                  style={styles.calendarMapPickerSearchInput}
                  value={mapPickerSearchText}
                />
              </View>
              {isMapPickerSearchOpen && mapPickerSearchResults.length > 0 && (
                <View style={styles.calendarMapPickerSearchResults}>
                  {mapPickerSearchResults.map((place, index) => (
                    <View key={`${place.label}-${place.lat}-${place.lng}-${index}`} style={styles.calendarMapPickerSearchResultItem}>
                      <Pressable onPress={() => focusMapPickerPlace(place)} style={styles.calendarMapPickerSearchResultMain}>
                        <Text style={styles.calendarMapPickerSearchResultTitle}>{place.label}</Text>
                        <Text numberOfLines={1} style={styles.calendarMapPickerSearchResultMeta}>{[place.category, place.address].filter(Boolean).join(' / ')}</Text>
                      </Pressable>
                    </View>
                  ))}
                  <Text style={styles.calendarMapPickerSearchAttribution}>네이버 지역 검색 결과</Text>
                </View>
              )}
              {isMapPickerSearchOpen && !!mapPickerSearchMessage && mapPickerSearchResults.length === 0 && (
                <Text style={styles.calendarMapPickerSearchMessage}>{mapPickerSearchMessage}</Text>
              )}
            </View>
            {!!mapPickerSource && (
              <View style={styles.calendarMapPickerWebView}>
                <WebView
                  ref={mapPickerWebViewRef}
                  source={{ uri: mapPickerSource }}
                  javaScriptEnabled
                  domStorageEnabled
                  androidLayerType="hardware"
                  mixedContentMode="always"
                  originWhitelist={['*']}
                  setSupportMultipleWindows={false}
                  thirdPartyCookiesEnabled
                  onMessage={handleMapPickerMessage}
                  style={styles.calendarMapPickerWebView}
                />
                {/* 가운데 고정 핀: 핀 끝이 지도 정가운데에 닿습니다. 지도를 만지는 데 방해되지 않게 터치는 통과시킵니다. */}
                <View pointerEvents="none" style={styles.calendarMapPickerCenterPin}>
                  <Animated.View style={{ transform: [{ translateY: pinLift.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }] }}>
                    <Ionicons color={accentTone} name="location-sharp" size={46} />
                  </Animated.View>
                  <Animated.View style={[styles.calendarMapPickerPinShadow, { opacity: pinLift.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.15] }) }]} />
                </View>
              </View>
            )}
            <View style={[styles.calendarMapPickerConfirmBar, { paddingBottom: Math.max(14, insets.bottom + 10) }]}>
              <View style={styles.calendarMapPickerConfirmTextGroup}>
                <Text numberOfLines={2} style={styles.calendarMapPickerConfirmTitle}>
                  {isMapMoving ? '위치 찾는 중…' : pendingLocation ? pendingLocation.label : '지도를 움직여 핀을 맞춰 주세요'}
                </Text>
                <Text numberOfLines={2} style={styles.calendarMapPickerConfirmMeta}>
                  {isMapMoving
                    ? ''
                    : pendingLocation?.source === 'naver_local'
                      // 업종은 '생활,편의>편의점'에서 끝 단계('편의점')만 보여 줍니다.
                      ? [pendingLocation.category?.split('>').pop(), pendingLocation.address].filter(Boolean).join(' · ') || '네이버 지역 검색 결과'
                      : pendingLocation ? '핀이 가리키는 위치' : ''}
                </Text>
              </View>
              <Pressable
                disabled={!pendingLocation || isMapMoving}
                onPress={() => pendingLocation && applyPickedLocation(pendingLocation)}
                style={({ pressed }) => [
                  styles.calendarMapPickerConfirmButton,
                  { backgroundColor: pendingLocation && !isMapMoving ? accentTone : textColors.disabled },
                  pressed && pendingLocation && styles.pressedFeedback,
                ]}
              >
                <Text style={styles.calendarMapPickerConfirmButtonText}>이 위치로 설정</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

