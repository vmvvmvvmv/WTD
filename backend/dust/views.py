import requests
import pandas as pd
from datetime import datetime, timedelta
from prophet import Prophet
from rest_framework.decorators import api_view
from rest_framework.response import Response
import os
import math
import re
import json
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import time
from urllib.parse import unquote
from django.core.cache import cache
from django.http import HttpResponse
from django.utils import timezone
from dotenv import load_dotenv
from .notification_registry import notification_device_response, upsert_notification_device
from .models import AirQualityStation, DustChatLog, DustMeasurement, HourlyDustPrediction, NotificationDevice, RealtimeDustMeasurement, WeatherHourlyMeasurement, WeatherMidTermForecast
from .midterm_weather import MIDTERM_REGIONS, current_midterm_announce_candidates, midterm_region_from_lat_lng
from .ml.hourly_pm10 import build_ml_hourly_pm10_forecast

load_dotenv()

def _env_first(*names):
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return value.strip()
    return ''


def _public_data_service_key(value):
    # 공공데이터포털에서 일반 인증키 하나만 받은 경우도 이 함수로 통일해서 사용합니다.
    # requests.get(..., params=...)가 URL 인코딩을 처리하므로, 저장값이 인코딩된 키면 한 번만 디코딩합니다.
    return unquote(value or '')


PUBLIC_DATA_API_KEY = _env_first('PUBLIC_DATA_API_KEY', 'PUBLIC_DATA_SERVICE_KEY', 'DATA_GO_KR_SERVICE_KEY', 'SERVICE_KEY')
API_KEY = _env_first(
    'DUST_API_KEY',
    'AIRKOREA_SERVICE_KEY',
    'AIRKOREA_API_KEY',
    'REACT_APP_DUST_API_KEY',
    'EXPO_PUBLIC_DUST_API_KEY',
    'API_KEY',
    'PUBLIC_DATA_API_KEY',
    'PUBLIC_DATA_SERVICE_KEY',
    'DATA_GO_KR_SERVICE_KEY',
    'SERVICE_KEY',
)
AIRKOREA_SERVICE_KEY = _public_data_service_key(API_KEY)
API_URL = "http://apis.data.go.kr/B552584/ArpltnStatsSvc/getMsrstnAcctoRDyrg"
STATION_INFO_URL = "http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList"
REALTIME_DUST_URL = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty"
STATION_REALTIME_DUST_URL = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty"
KMA_VILAGE_FORECAST_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
KMA_ULTRA_SHORT_FORECAST_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst"
KMA_ULTRA_SHORT_NOWCAST_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"
KMA_ASOS_DAILY_URL = "http://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList"
KMA_MID_TERM_LAND_URL = "http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst"
KMA_MID_TERM_TEMPERATURE_URL = "http://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa"
KMA_API_KEY = _public_data_service_key(_env_first(
    'KMA_API_KEY',
    'KMA_SERVICE_KEY',
    'WEATHER_API_KEY',
    'PUBLIC_DATA_API_KEY',
    'PUBLIC_DATA_SERVICE_KEY',
    'DATA_GO_KR_SERVICE_KEY',
    'SERVICE_KEY',
))
NAVER_MAP_CLIENT_ID = os.getenv('NAVER_MAP_CLIENT_ID') or os.getenv('REACT_APP_NAVER_MAP_CLIENT_ID') or os.getenv('EXPO_PUBLIC_NAVER_MAP_CLIENT_ID') or ''
NAVER_SEARCH_CLIENT_ID = os.getenv('NAVER_SEARCH_CLIENT_ID') or os.getenv('NAVER_CLIENT_ID') or ''
NAVER_SEARCH_CLIENT_SECRET = os.getenv('NAVER_SEARCH_CLIENT_SECRET') or os.getenv('NAVER_CLIENT_SECRET') or ''
AIRKOREA_HEADERS = {
    "Accept": "application/json, text/xml, */*",
    "User-Agent": "Mozilla/5.0",
}

NAVER_LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json"
AIRKOREA_REQUEST_WORKERS = 8
ASOS_STATIONS = [
    {"id": "90", "name": "속초", "lat": 38.2509, "lng": 128.5647},
    {"id": "93", "name": "북춘천", "lat": 37.9474, "lng": 127.7544},
    {"id": "95", "name": "철원", "lat": 38.1479, "lng": 127.3042},
    {"id": "98", "name": "동두천", "lat": 37.9019, "lng": 127.0607},
    {"id": "99", "name": "파주", "lat": 37.8859, "lng": 126.7665},
    {"id": "100", "name": "대관령", "lat": 37.6771, "lng": 128.7183},
    {"id": "101", "name": "춘천", "lat": 37.9026, "lng": 127.7357},
    {"id": "102", "name": "백령도", "lat": 37.9739, "lng": 124.7124},
    {"id": "104", "name": "북강릉", "lat": 37.8046, "lng": 128.8554},
    {"id": "105", "name": "강릉", "lat": 37.7515, "lng": 128.8910},
    {"id": "106", "name": "동해", "lat": 37.5071, "lng": 129.1243},
    {"id": "108", "name": "서울", "lat": 37.5714, "lng": 126.9658},
    {"id": "112", "name": "인천", "lat": 37.4777, "lng": 126.6249},
    {"id": "119", "name": "수원", "lat": 37.2575, "lng": 126.9830},
    {"id": "127", "name": "충주", "lat": 36.9705, "lng": 127.9525},
    {"id": "129", "name": "서산", "lat": 36.7766, "lng": 126.4939},
    {"id": "130", "name": "울진", "lat": 36.9918, "lng": 129.4128},
    {"id": "131", "name": "청주", "lat": 36.6392, "lng": 127.4407},
    {"id": "133", "name": "대전", "lat": 36.3719, "lng": 127.3721},
    {"id": "135", "name": "추풍령", "lat": 36.2203, "lng": 127.9946},
    {"id": "136", "name": "안동", "lat": 36.5729, "lng": 128.7073},
    {"id": "137", "name": "상주", "lat": 36.4084, "lng": 128.1574},
    {"id": "138", "name": "포항", "lat": 36.0320, "lng": 129.3800},
    {"id": "140", "name": "군산", "lat": 35.9879, "lng": 126.7052},
    {"id": "143", "name": "대구", "lat": 35.8780, "lng": 128.6529},
    {"id": "146", "name": "전주", "lat": 35.8409, "lng": 127.1172},
    {"id": "152", "name": "울산", "lat": 35.5824, "lng": 129.3347},
    {"id": "155", "name": "창원", "lat": 35.1702, "lng": 128.5728},
    {"id": "156", "name": "광주", "lat": 35.1729, "lng": 126.8916},
    {"id": "159", "name": "부산", "lat": 35.1047, "lng": 129.0320},
    {"id": "162", "name": "통영", "lat": 34.8454, "lng": 128.4356},
    {"id": "165", "name": "목포", "lat": 34.8173, "lng": 126.3815},
    {"id": "168", "name": "여수", "lat": 34.7393, "lng": 127.7406},
    {"id": "184", "name": "제주", "lat": 33.5141, "lng": 126.5297},
]
SIDO_NAMES = [
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]

SIDO_STATION_ADDR_ALIASES = {
    '서울': ['서울', '서울특별시'],
    '부산': ['부산', '부산광역시'],
    '대구': ['대구', '대구광역시'],
    '인천': ['인천', '인천광역시'],
    '광주': ['광주', '광주광역시'],
    '대전': ['대전', '대전광역시'],
    '울산': ['울산', '울산광역시'],
    '세종': ['세종', '세종특별자치시'],
    '경기': ['경기', '경기도'],
    '강원': ['강원', '강원특별자치도', '강원도'],
    '충북': ['충북', '충청북도'],
    '충남': ['충남', '충청남도'],
    '전북': ['전북', '전북특별자치도', '전라북도'],
    '전남': ['전남', '전라남도'],
    '경북': ['경북', '경상북도'],
    '경남': ['경남', '경상남도'],
    '제주': ['제주', '제주특별자치도'],
}
SIDO_NAMES = [
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]

SIDO_STATION_ADDR_ALIASES = {
    '서울': ['서울', '서울특별시'],
    '부산': ['부산', '부산광역시'],
    '대구': ['대구', '대구광역시'],
    '인천': ['인천', '인천광역시'],
    '광주': ['광주', '광주광역시'],
    '대전': ['대전', '대전광역시'],
    '울산': ['울산', '울산광역시'],
    '세종': ['세종', '세종특별자치시'],
    '경기': ['경기', '경기도'],
    '강원': ['강원', '강원특별자치도', '강원도'],
    '충북': ['충북', '충청북도'],
    '충남': ['충남', '충청남도'],
    '전북': ['전북', '전북특별자치도', '전라북도'],
    '전남': ['전남', '전라남도'],
    '경북': ['경북', '경상북도'],
    '경남': ['경남', '경상남도'],
    '제주': ['제주', '제주특별자치도'],
}


SIDO_NAMES = [
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]

SIDO_STATION_ADDR_ALIASES = {
    '서울': ['서울', '서울특별시'],
    '부산': ['부산', '부산광역시'],
    '대구': ['대구', '대구광역시'],
    '인천': ['인천', '인천광역시'],
    '광주': ['광주', '광주광역시'],
    '대전': ['대전', '대전광역시'],
    '울산': ['울산', '울산광역시'],
    '세종': ['세종', '세종특별자치시'],
    '경기': ['경기', '경기도'],
    '강원': ['강원', '강원특별자치도', '강원도'],
    '충북': ['충북', '충청북도'],
    '충남': ['충남', '충청남도'],
    '전북': ['전북', '전북특별자치도', '전라북도'],
    '전남': ['전남', '전라남도'],
    '경북': ['경북', '경상북도'],
    '경남': ['경남', '경상남도'],
    '제주': ['제주', '제주특별자치도'],
}

def mobile_map(request):
    client_id = NAVER_MAP_CLIENT_ID
    initial_mode = "weather" if request.GET.get("mode") == "weather" else "dust"
    picker_mode = request.GET.get("picker") == "1"
    view_mode = request.GET.get("view") or ("picker" if picker_mode else "unknown")
    basic_mode = request.GET.get("basic") == "1"
    initial_lat = _to_float(request.GET.get("lat"))
    initial_lng = _to_float(request.GET.get("lng"))
    try:
        initial_zoom = int(request.GET.get("zoom") or 7)
    except (TypeError, ValueError):
        initial_zoom = 7
    initial_zoom = max(6, min(initial_zoom, 18))
    initial_lat_js = "null" if initial_lat is None else str(initial_lat)
    initial_lng_js = "null" if initial_lng is None else str(initial_lng)
    app_test_token_js = json.dumps(request.GET.get("app_test_token", ""))
    html = f"""<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <style>
      html, body {{
        width: 100%;
        height: 100%;
        min-height: 100vh;
        margin: 0;
        overflow: hidden;
        padding: 0;
      }}
      body {{
        background: #f4f6f5;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        inset: 0;
        position: fixed;
      }}
      #map {{
        height: 100vh;
        inset: 0;
        margin: 0;
        min-height: 1px;
        min-width: 1px;
        overflow: hidden;
        padding: 0;
        position: fixed;
        transform: translateZ(0);
        width: 100vw;
      }}
      .empty {{
        align-items: center;
        color: #687180;
        display: flex;
        font-size: 14px;
        height: 100%;
        justify-content: center;
        padding: 24px;
        text-align: center;
      }}
      .marker {{
        align-items: center;
        background: #2fbf71;
        border: 2px solid #fff;
        border-radius: 999px;
        box-shadow: 0 2px 8px rgba(47,191,113,.42);
        color: #fff;
        display: flex;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 12px;
        font-weight: 800;
        height: 38px;
        justify-content: center;
        line-height: 1;
        overflow: hidden;
        padding: 0;
        text-align: center;
        width: 38px;
      }}
      .picker-gps-marker {{
        display: block;
        height: 52px;
        object-fit: contain;
        width: 52px;
      }}
      .marker-wrap {{
        align-items: center;
        display: flex;
        flex-direction: column;
        gap: 4px;
        transform: translateX(-1px);
      }}
      .marker-label {{
        background: rgba(255,255,255,.94);
        border: 1px solid rgba(213,222,216,.9);
        border-radius: 999px;
        box-shadow: 0 2px 8px rgba(20,24,33,.12);
        color: #141821;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
        max-width: 86px;
        overflow: hidden;
        padding: 7px 10px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }}
      .marker-label.selected {{
        border-color: rgba(20,24,33,.58);
        border-width: 2px;
        box-shadow: 0 3px 12px rgba(20,24,33,.18);
      }}
      .marker.moderate {{ background: #2f80ed; box-shadow: 0 2px 8px rgba(47,128,237,.42); }}
      .marker.bad {{ background: #c47b20; box-shadow: 0 2px 8px rgba(196,123,32,.42); }}
      .marker.verybad {{ background: #c84a4a; box-shadow: 0 2px 8px rgba(200,74,74,.42); }}
      .marker.unknown {{ background: #8f98a6; box-shadow: 0 2px 8px rgba(104,113,128,.34); }}
      .marker.weather-cold {{ background: #2f80ed; box-shadow: 0 2px 8px rgba(47,128,237,.42); }}
      .marker.weather-cool {{ background: #42a5f5; box-shadow: 0 2px 8px rgba(66,165,245,.38); }}
      .marker.weather-mild {{ background: #2fbf71; box-shadow: 0 2px 8px rgba(47,191,113,.42); }}
      .marker.weather-warm {{ background: #f3b43f; box-shadow: 0 2px 8px rgba(243,180,63,.42); }}
      .marker.weather-hot {{ background: #d94b4b; box-shadow: 0 2px 8px rgba(217,75,75,.42); }}
      .marker.selected {{
        border-color: rgba(20,24,33,.58);
        border-width: 3px;
        box-shadow: 0 3px 12px rgba(20,24,33,.22);
      }}
      .info {{
        color: #141821;
        font-size: 13px;
        line-height: 1.45;
        min-width: 190px;
        padding: 10px;
      }}
      .info strong {{
        display: block;
        font-size: 15px;
        margin-bottom: 8px;
      }}
      .info .grid {{
        display: grid;
        gap: 6px;
        grid-template-columns: 1fr 1fr;
      }}
      .info .metric {{
        background: #f4f6f5;
        border: 1px solid #d9eee2;
        border-radius: 8px;
        padding: 7px;
      }}
      .info .label {{
        color: #687180;
        display: block;
        font-size: 11px;
        font-weight: 700;
      }}
      .info .value {{
        color: #141821;
        display: block;
        font-size: 14px;
        font-weight: 900;
        margin-top: 2px;
      }}
      .muted {{
        color: #687180;
        font-size: 12px;
        margin-top: 4px;
      }}
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      const mapElement = document.getElementById('map');
      let mapMode = '{initial_mode}';
      const pickerMode = {str(picker_mode).lower()};
      const viewMode = {json.dumps(view_mode)};
      const basicMode = {str(basic_mode).lower()};
      const initialLat = {initial_lat_js};
      const initialLng = {initial_lng_js};
      const initialZoom = {initial_zoom};
      const appTestToken = {app_test_token_js};

      function mapDebug(event, details) {{
        const payload = {{
          event,
          details: Object.assign({{ view: viewMode }}, details || {{}}),
          href: window.location.href.replace(/app_test_token=[^&]+/g, 'app_test_token=[hidden]'),
          userAgent: navigator.userAgent
        }};
        try {{
          fetch('/dust/mobile-map/log/', {{
            method: 'POST',
            headers: Object.assign(
              {{ 'Content-Type': 'application/json' }},
              appTestToken ? {{ 'X-App-Test-Token': appTestToken }} : {{}}
            ),
            body: JSON.stringify(payload)
          }}).catch(function() {{}});
        }} catch (error) {{}}
      }}

      function safeHtml(value) {{
        return String(value || '').replace(/[&<>"']/g, function(char) {{
          return {{
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
          }}[char];
        }});
      }}

      function showMapError(message) {{
        mapDebug('map_error', {{ message }});
        mapElement.innerHTML = '<div class="empty">' + safeHtml(message) + '</div>';
        if (window.ReactNativeWebView) {{
          window.ReactNativeWebView.postMessage(JSON.stringify({{
            type: 'map-error',
            message
          }}));
        }}
      }}

      function viewportSize() {{
        const viewport = window.visualViewport || {{}};
        const docRect = document.documentElement.getBoundingClientRect ? document.documentElement.getBoundingClientRect() : {{}};
        return {{
          width: Math.max(
            1,
            Math.round(viewport.width || 0),
            window.innerWidth || 0,
            document.documentElement.clientWidth || 0,
            Math.round(docRect.width || 0),
            window.screen && window.screen.width ? window.screen.width : 0
          ),
          height: Math.max(
            1,
            Math.round(viewport.height || 0),
            window.innerHeight || 0,
            document.documentElement.clientHeight || 0,
            Math.round(docRect.height || 0),
            window.screen && window.screen.height ? window.screen.height : 0
          )
        }};
      }}

      function ensureMapElementSize() {{
        const viewport = viewportSize();
        const width = viewport.width;
        const height = viewport.height;
        mapElement.style.width = width + 'px';
        mapElement.style.height = height + 'px';
        mapElement.style.minWidth = width + 'px';
        mapElement.style.minHeight = height + 'px';
        document.documentElement.style.width = width + 'px';
        document.documentElement.style.height = height + 'px';
        document.body.style.width = width + 'px';
        document.body.style.height = height + 'px';
        void mapElement.offsetHeight;
        const rect = mapElement.getBoundingClientRect ? mapElement.getBoundingClientRect() : {{}};
        return {{
          width: Math.round(rect.width || mapElement.clientWidth || width),
          height: Math.round(rect.height || mapElement.clientHeight || height),
          clientWidth: mapElement.clientWidth || 0,
          clientHeight: mapElement.clientHeight || 0,
          rectWidth: Math.round(rect.width || 0),
          rectHeight: Math.round(rect.height || 0),
          windowWidth: window.innerWidth || 0,
          windowHeight: window.innerHeight || 0,
          visualViewportWidth: window.visualViewport ? Math.round(window.visualViewport.width || 0) : 0,
          visualViewportHeight: window.visualViewport ? Math.round(window.visualViewport.height || 0) : 0
        }};
      }}

      function afterLayout(callback) {{
        requestAnimationFrame(function() {{
          ensureMapElementSize();
          requestAnimationFrame(function() {{
            const size = ensureMapElementSize();
            callback(size);
          }});
        }});
      }}

      function waitForMapElementSize(callback, attempt) {{
        const currentAttempt = attempt || 0;
        const size = ensureMapElementSize();
        if (size.width > 1 && size.height > 1) {{
          afterLayout(callback);
          return;
        }}
        if (currentAttempt >= 30) {{
          mapDebug('map_size_wait_timeout', size);
          afterLayout(callback);
          return;
        }}
        if (currentAttempt === 0 || currentAttempt === 10 || currentAttempt === 20) {{
          mapDebug('map_size_waiting', Object.assign({{ attempt: currentAttempt }}, size));
        }}
        setTimeout(() => waitForMapElementSize(callback, currentAttempt + 1), 100);
      }}

      if (!'{client_id}') {{
        showMapError('Naver Maps client ID is missing.');
      }}

      function isMissingValue(value) {{
        return value === null || value === undefined || value === '' || value === '-';
      }}

      function gradeClass(pm10) {{
        if (isMissingValue(pm10)) return 'unknown';
        const value = Number(pm10);
        if (!Number.isFinite(value)) return 'unknown';
        if (value <= 30) return '';
        if (value <= 80) return 'moderate';
        if (value <= 150) return 'bad';
        return 'verybad';
      }}

      function weatherGradeClass(value) {{
        if (isMissingValue(value)) return 'unknown';
        const temperature = Number(value);
        if (!Number.isFinite(temperature)) return 'unknown';
        if (temperature <= 0) return 'weather-cold';
        if (temperature <= 12) return 'weather-cool';
        if (temperature <= 26) return 'weather-mild';
        if (temperature < 33) return 'weather-warm';
        return 'weather-hot';
      }}

      function stationMetricValue(station) {{
        return mapMode === 'weather' ? station.weatherTemperature : station.pm10;
      }}

      function markerClass(station) {{
        return mapMode === 'weather' ? weatherGradeClass(station.weatherTemperature) : gradeClass(station.pm10);
      }}

      function markerValue(station) {{
        const sourceValue = stationMetricValue(station);
        if (isMissingValue(sourceValue)) return '?';
        const value = Number(sourceValue);
        if (!Number.isFinite(value)) return '?';
        if (value > 999) return '999';
        return String(Math.round(value));
      }}

      function displayValue(value, fallback = '?') {{
        if (isMissingValue(value)) return fallback;
        return value;
      }}

      function escapeHtml(value) {{
        return String(value || '').replace(/[&<>"']/g, function(char) {{
          return {{
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
          }}[char];
        }});
      }}

      function markerLabel(station) {{
        return station.city || station.name || station.sido || '';
      }}

      function markerLimitByZoom(zoom) {{
        if (zoom <= 7) return 90;
        if (zoom <= 8) return 150;
        if (zoom <= 9) return 260;
        if (zoom <= 10) return 420;
        if (zoom <= 11) return 620;
        return 1000;
      }}

      function stationKey(station) {{
        const coords = normalizeLatLng(station.lat, station.lng) || {{ lat: station.lat || '', lng: station.lng || '' }};
        return [
          station.sido || '',
          station.city || '',
          station.name || '',
          station.addr || '',
          coords.lat || '',
          coords.lng || ''
        ].join('|');
      }}

      function normalizeLatLng(latValue, lngValue) {{
        let lat = Number(latValue);
        let lng = Number(lngValue);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {{
          const nextLat = lng;
          lng = lat;
          lat = nextLat;
        }}
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        return {{ lat, lng }};
      }}

      function compactText(value) {{
        return String(value || '').replace(/\\s/g, '').toLowerCase();
      }}

      function isInsideBounds(bounds, station) {{
        if (!bounds || typeof bounds.hasLatLng !== 'function') return true;
        const coords = normalizeLatLng(station.lat, station.lng);
        if (!coords) return false;
        return bounds.hasLatLng(new naver.maps.LatLng(coords.lat, coords.lng));
      }}

      function selectVisibleStations(stations, map, forcedKey) {{
        const zoom = map.getZoom();
        const bounds = map.getBounds();
        const limit = markerLimitByZoom(zoom);
        const cellSize = zoom <= 7 ? 0.58 : zoom <= 8 ? 0.36 : zoom <= 9 ? 0.19 : zoom <= 10 ? 0.1 : zoom <= 11 ? 0.045 : 0.01;
        const selectedByCell = new window.Map();
        let forcedStation = null;

        stations.forEach((station) => {{
          const coords = normalizeLatLng(station.lat, station.lng);
          if (!coords) return;
          const lat = coords.lat;
          const lng = coords.lng;
          if (forcedKey && stationKey(station) === forcedKey) forcedStation = station;
          if (!isInsideBounds(bounds, station) && !(forcedKey && stationKey(station) === forcedKey)) return;
          const markerSource = stationMetricValue(station);
          const value = isMissingValue(markerSource) ? NaN : Number(markerSource);
          const score = Number.isFinite(value) ? value : -1;
          const cellKey = Math.floor(lat / cellSize) + ':' + Math.floor(lng / cellSize);
          const existing = selectedByCell.get(cellKey);
          const existingSource = existing ? stationMetricValue(existing) : null;
          const existingValue = existing && !isMissingValue(existingSource) ? Number(existingSource) : -1;
          const existingScore = Number.isFinite(existingValue) ? existingValue : -1;
          if (!existing || score > existingScore) selectedByCell.set(cellKey, station);
        }});

        const selected = Array.from(selectedByCell.values()).slice(0, limit);
        if (forcedStation && !selected.some((station) => stationKey(station) === forcedKey)) {{
          selected.push(forcedStation);
        }}
        return selected;
      }}

      function renderMap(stations) {{
        const ensuredSize = ensureMapElementSize();
        mapDebug('map_render_start', {{
          stationCount: Array.isArray(stations) ? stations.length : 0,
          initialLat,
          initialLng,
          initialZoom,
          mapElementWidth: mapElement.clientWidth,
          mapElementHeight: mapElement.clientHeight,
          ensuredWidth: ensuredSize.width,
          ensuredHeight: ensuredSize.height,
          windowWidth: ensuredSize.windowWidth,
          windowHeight: ensuredSize.windowHeight
        }});
        const initialCenter = new naver.maps.LatLng(initialLat || 36.5, initialLng || 127.8);
        const map = new naver.maps.Map(mapElement, {{
          center: initialCenter,
          zoom: initialLat && initialLng ? initialZoom : 7,
          minZoom: 6,
          zoomControl: false
        }});
        window.__naverMapReady = true;
        mapDebug('map_created', {{
          childCount: mapElement.children.length,
          centerLat: map.getCenter && typeof map.getCenter().lat === 'function' ? map.getCenter().lat() : '',
          centerLng: map.getCenter && typeof map.getCenter().lng === 'function' ? map.getCenter().lng() : '',
          zoom: map.getZoom ? map.getZoom() : ''
        }});
        let opened = null;
        let focusedKey = null;
        let activeMarkers = [];
        let lastMarkerClick = {{ key: null, time: 0 }};
        let pickerMarker = null;

        function setPickerMarker(lat, lng) {{
          const position = new naver.maps.LatLng(lat, lng);
          if (pickerMarker) {{
            pickerMarker.setPosition(position);
            return;
          }}
          pickerMarker = new naver.maps.Marker({{
            position,
            map,
            zIndex: 5000,
            icon: {{
              content: '<img class="picker-gps-marker" src="/static/img/gps-marker.png" alt="">',
              size: new naver.maps.Size(52, 52),
              anchor: new naver.maps.Point(26, 26)
            }}
          }});
        }}

        function compactAddressName(address) {{
          if (!address) return '';
          const parts = String(address).split(/\\s+/).filter(Boolean);
          const district = parts.find((part) => /[가-힣]+(동|읍|면|리)$/.test(part));
          const city = parts.find((part) => /[가-힣]+(시|군|구)$/.test(part));
          return district || city || parts.slice(-2).join(' ') || address;
        }}

        function reverseGeocodePickerLocation(lat, lng, fallbackLabel) {{
          return new Promise((resolve) => {{
            if (!naver.maps.Service || typeof naver.maps.Service.reverseGeocode !== 'function') {{
              resolve({{
                address: '',
                city: '',
                label: fallbackLabel,
                region: fallbackLabel
              }});
              return;
            }}
            naver.maps.Service.reverseGeocode({{
              coords: new naver.maps.LatLng(lat, lng),
              orders: [
                naver.maps.Service.OrderType.ADDR,
                naver.maps.Service.OrderType.ROAD_ADDR
              ].join(',')
            }}, (status, response) => {{
              const results = response && response.v2 && Array.isArray(response.v2.results) ? response.v2.results : [];
              const result = results.find((item) => item.name === 'roadaddr') || results[0];
              const area = result && result.region ? result.region : null;
              const land = result && result.land ? result.land : null;
              const area1 = area && area.area1 ? area.area1.name : '';
              const area2 = area && area.area2 ? area.area2.name : '';
              const area3 = area && area.area3 ? area.area3.name : '';
              const area4 = area && area.area4 ? area.area4.name : '';
              const road = land && land.name ? land.name : '';
              const number1 = land && land.number1 ? land.number1 : '';
              const number2 = land && land.number2 ? land.number2 : '';
              const lotNumber = [number1, number2].filter(Boolean).join('-');
              const address = [area1, area2, area3 || area4, road, lotNumber].filter(Boolean).join(' ');
              const region = area3 || area4 || area2 || area1 || compactAddressName(address) || fallbackLabel;
              resolve({{
                address,
                city: area1 || '',
                label: compactAddressName(address) || region || fallbackLabel,
                region
              }});
            }});
          }});
        }}

        function clearMarkers() {{
          activeMarkers.forEach((marker) => marker.setMap(null));
          activeMarkers = [];
        }}

        function renderMarkers() {{
          clearMarkers();
          if (pickerMode) return;
          const showLabels = map.getZoom() >= 8;
          const visibleStations = selectVisibleStations(stations, map, focusedKey);
          visibleStations.forEach((station) => {{
            const coords = normalizeLatLng(station.lat, station.lng);
            if (!coords) return;
            const lat = coords.lat;
            const lng = coords.lng;
            const isFocused = stationKey(station) === focusedKey;
            const marker = new naver.maps.Marker({{
              position: new naver.maps.LatLng(lat, lng),
              map,
              zIndex: isFocused ? 3000 : 1000,
              icon: {{
                content:
                  '<div class="marker-wrap">' +
                  '<div class="marker ' + markerClass(station) + (isFocused ? ' selected' : '') + '">' + markerValue(station) + '</div>' +
                  (showLabels ? '<div class="marker-label ' + (isFocused ? 'selected' : '') + '">' + escapeHtml(markerLabel(station)) + '</div>' : '') +
                  '</div>',
                size: new naver.maps.Size(92, showLabels ? 72 : 42),
                anchor: new naver.maps.Point(46, 19)
              }}
            }});
            const info = new naver.maps.InfoWindow({{
              content:
                '<div class="info">' +
                '<strong>' + (station.name || station.city || '측정소') + '</strong>' +
                '<div class="grid">' +
                '<div class="metric"><span class="label">PM10</span><span class="value">' + displayValue(station.pm10) + ' ug/m3</span></div>' +
                '<div class="metric"><span class="label">PM2.5</span><span class="value">' + displayValue(station.pm25) + ' ug/m3</span></div>' +
                '<div class="metric"><span class="label">O3</span><span class="value">' + displayValue(station.o3) + ' ppm</span></div>' +
                '<div class="metric"><span class="label">NO2</span><span class="value">' + displayValue(station.no2) + ' ppm</span></div>' +
                '<div class="metric"><span class="label">기온</span><span class="value">' + displayValue(station.weatherTemperature) + '°</span></div>' +
                '<div class="metric"><span class="label">습도</span><span class="value">' + displayValue(station.weatherHumidity) + '%</span></div>' +
                '</div>' +
                '<div class="muted">' + (station.addr || '') + '</div>' +
                '<div class="muted">' + (station.time || '') + '</div>' +
                '</div>'
            }});
            naver.maps.Event.addListener(marker, 'click', () => {{
            
            
              focusedKey = stationKey(station);
              const key = stationKey(station);
              const now = Date.now();
              map.panTo(marker.getPosition());
              setTimeout(renderMarkers, 0);
              if (window.ReactNativeWebView) {{
                window.ReactNativeWebView.postMessage(JSON.stringify({{
                  type: lastMarkerClick.key === key && now - lastMarkerClick.time < 360 ? 'station-detail' : 'station-selected',
                  station
                }}));
                lastMarkerClick = {{ key, time: now }};
                return;
              }}
              if (opened) opened.close();
              info.open(map, marker);
              opened = info;
            }});
            activeMarkers.push(marker);
          }});
        }}

        window.focusStation = function(payload) {{
          const data = typeof payload === 'object' && payload ? payload : {{ lat: arguments[0], lng: arguments[1] }};
          const coords = normalizeLatLng(data.lat, data.lng);
          if (!coords) return;
          const requestedKey = data.key || '';
          const target = stations.find((station) => {{
            if (requestedKey && stationKey(station) === requestedKey) return true;
            const stationCoords = normalizeLatLng(station.lat, station.lng);
            if (!stationCoords) return false;
            const sameCoords = Math.abs(stationCoords.lat - coords.lat) < 0.000001 && Math.abs(stationCoords.lng - coords.lng) < 0.000001;
            const sameName = compactText(station.name || station.city) === compactText(data.name || data.city);
            const sameSido = !data.sido || station.sido === data.sido;
            return sameCoords || (sameName && sameSido);
          }});
          focusedKey = target ? stationKey(target) : null;
          const targetCoords = target ? normalizeLatLng(target.lat, target.lng) : coords;
          if (pickerMode && window.ReactNativeWebView) {{
            setPickerMarker(targetCoords.lat, targetCoords.lng);
            window.ReactNativeWebView.postMessage(JSON.stringify({{
              type: 'map-picked',
              location: {{
                label: target ? (target.name || target.city || '지도 선택 위치') : (data.label || data.name || data.city || '지도 선택 위치'),
                address: target ? target.addr : (data.address || ''),
                city: target ? target.sido : (data.city || ''),
                lat: targetCoords.lat,
                lng: targetCoords.lng,
                region: target ? (target.city || target.name || '') : (data.region || ''),
                source: target ? 'station' : (data.source || 'naver_local')
              }}
            }}));
          }} else if (target && window.ReactNativeWebView) {{
            window.ReactNativeWebView.postMessage(JSON.stringify({{
              type: 'station-selected',
              station: target
            }}));
          }}
          const next = new naver.maps.LatLng(targetCoords.lat, targetCoords.lng);
          const nextZoom = Math.max(map.getZoom(), 12);
          if (typeof map.morph === 'function') {{
            map.morph(next, nextZoom);
          }} else {{
            map.panTo(next);
            setTimeout(() => map.setZoom(nextZoom, true), 260);
          }}
          setTimeout(() => map.setZoom(nextZoom, true), 520);
          setTimeout(() => {{
            map.setCenter(next);
            map.setZoom(nextZoom, true);
            renderMarkers();
          }}, 900);
        }};

        if (window.__pendingFocusStation) {{
          const pending = window.__pendingFocusStation;
          window.__pendingFocusStation = null;
          setTimeout(() => window.focusStation(pending), 120);
        }}

        window.setMapMode = function(nextMode) {{
          mapMode = nextMode === 'weather' ? 'weather' : 'dust';
          renderMarkers();
        }};

        if (pickerMode) {{
          naver.maps.Event.addListener(map, 'click', async (event) => {{
            const coord = event.coord || event.latlng;
            if (!coord || !window.ReactNativeWebView) return;
            const lat = typeof coord.lat === 'function' ? coord.lat() : coord.y;
            const lng = typeof coord.lng === 'function' ? coord.lng() : coord.x;
            if (typeof lat !== 'number' || typeof lng !== 'number') return;
            setPickerMarker(lat, lng);
            const resolvedLocation = await reverseGeocodePickerLocation(lat, lng, '지도 선택 위치');
            window.ReactNativeWebView.postMessage(JSON.stringify({{
              type: 'map-picked',
              location: {{
                label: '지도 선택 위치',
                address: resolvedLocation.address,
                city: resolvedLocation.city,
                lat,
                lng,
                region: resolvedLocation.region,
                source: 'naver_map'
              }}
            }}));
          }});
        }}

        /*
        stations.forEach((station) => {{
          if (typeof station.lat !== 'number' || typeof station.lng !== 'number') return;
          const marker = new naver.maps.Marker({{
            position: new naver.maps.LatLng(station.lat, station.lng),
            map,
            icon: {{
              content: '<div class="marker ' + markerClass(station) + '">' + markerValue(station) + '</div>',
              size: new naver.maps.Size(42, 42),
              anchor: new naver.maps.Point(19, 19)
            }}
          }});
          const info = new naver.maps.InfoWindow({{
            content:
              '<div class="info">' +
              '<strong>' + (station.name || station.city || '측정소') + '</strong>' +
              '<div class="grid">' +
              '<div class="metric"><span class="label">PM10</span><span class="value">' + (station.pm10 ?? '-') + ' ug/m3</span></div>' +
              '<div class="metric"><span class="label">PM2.5</span><span class="value">' + (station.pm25 ?? '-') + ' ug/m3</span></div>' +
              '<div class="metric"><span class="label">O3</span><span class="value">' + (station.o3 ?? '-') + ' ppm</span></div>' +
              '<div class="metric"><span class="label">NO2</span><span class="value">' + (station.no2 ?? '-') + ' ppm</span></div>' +
              '</div>' +
              '<div class="muted">' + (station.time || '') + '</div>' +
              '</div>'
          }});
          naver.maps.Event.addListener(marker, 'click', () => {{
            map.panTo(marker.getPosition());
            if (window.ReactNativeWebView) {{
              window.ReactNativeWebView.postMessage(JSON.stringify({{
                type: 'station-selected',
                station
              }}));
              return;
            }}
            if (opened) opened.close();
            info.open(map, marker);
            opened = info;
          }});
        }});
        */
        naver.maps.Event.addListener(map, 'idle', () => {{
        
        
          mapDebug('map_idle', {{
            childCount: mapElement.children.length,
            markerCount: activeMarkers.length,
            width: mapElement.clientWidth,
            height: mapElement.clientHeight,
            zoom: map.getZoom ? map.getZoom() : ''
          }});
          renderMarkers();
        }});
        renderMarkers();
        setTimeout(() => {{
          mapDebug('map_render_after_2s', {{
            childCount: mapElement.children.length,
            markerCount: activeMarkers.length,
            width: mapElement.clientWidth,
            height: mapElement.clientHeight,
            zoom: map.getZoom ? map.getZoom() : ''
          }});
        }}, 2000);
      }}

      function renderBasicMap() {{
        const ensuredSize = ensureMapElementSize();
        mapDebug('basic_map_render_start', {{
          initialLat,
          initialLng,
          initialZoom,
          mapElementWidth: mapElement.clientWidth,
          mapElementHeight: mapElement.clientHeight,
          ensuredWidth: ensuredSize.width,
          ensuredHeight: ensuredSize.height,
          windowWidth: ensuredSize.windowWidth,
          windowHeight: ensuredSize.windowHeight
        }});
        const center = new naver.maps.LatLng(initialLat || 36.5, initialLng || 127.8);
        const map = new naver.maps.Map(mapElement, {{
          center,
          zoom: initialLat && initialLng ? initialZoom : 7,
          minZoom: 6,
          zoomControl: false
        }});
        window.__naverMapReady = true;
        mapDebug('basic_map_created', {{
          childCount: mapElement.children.length,
          centerLat: map.getCenter && typeof map.getCenter().lat === 'function' ? map.getCenter().lat() : '',
          centerLng: map.getCenter && typeof map.getCenter().lng === 'function' ? map.getCenter().lng() : '',
          zoom: map.getZoom ? map.getZoom() : ''
        }});
        setTimeout(() => {{
          mapDebug('basic_map_after_2s', {{
            childCount: mapElement.children.length,
            width: mapElement.clientWidth,
            height: mapElement.clientHeight,
            bodyChildCount: document.body.children.length,
            bodyHtmlLength: document.body.innerHTML.length,
            mapHtmlLength: mapElement.innerHTML.length,
            imageCount: document.images.length,
            zoom: map.getZoom ? map.getZoom() : ''
          }});
        }}, 2000);
      }}

      function isNaverMapsReady() {{
        return !!(
          window.naver &&
          window.naver.maps &&
          typeof window.naver.maps.Map === 'function' &&
          typeof window.naver.maps.LatLng === 'function' &&
          typeof window.naver.maps.Marker === 'function' &&
          window.naver.maps.Event
        );
      }}

      function waitForNaverMaps(callback, attempt) {{
        const currentAttempt = attempt || 0;
        if (isNaverMapsReady()) {{
          callback();
          return;
        }}
        if (currentAttempt >= 40) {{
          showMapError('Naver Maps SDK is incomplete. Check Dynamic Map service URL and API key restrictions.');
          return;
        }}
        if (currentAttempt === 0 || currentAttempt === 10 || currentAttempt === 25) {{
          mapDebug('naver_sdk_waiting', {{
            attempt: currentAttempt,
            hasNaver: !!window.naver,
            hasMaps: !!(window.naver && window.naver.maps),
            hasMap: !!(window.naver && window.naver.maps && window.naver.maps.Map),
            hasLatLng: !!(window.naver && window.naver.maps && window.naver.maps.LatLng)
          }});
        }}
        setTimeout(() => waitForNaverMaps(callback, currentAttempt + 1), 150);
      }}

      function startMapAfterSdkReady() {{
        mapDebug('naver_sdk_ready', {{
          hasMap: typeof window.naver.maps.Map === 'function',
          hasLatLng: typeof window.naver.maps.LatLng === 'function',
          hasMarker: typeof window.naver.maps.Marker === 'function'
        }});
        if (basicMode) {{
          waitForMapElementSize(() => renderBasicMap());
          return;
        }}
        const stationFetchOptions = appTestToken
          ? {{ headers: {{ 'X-App-Test-Token': appTestToken }} }}
          : undefined;
        waitForNaverMaps(() => {{
          fetch('/dust/korea-stations/', stationFetchOptions)
            .then((response) => {{
              mapDebug('station_fetch_response', {{ status: response.status, ok: response.ok }});
              if (!response.ok) throw new Error('HTTP ' + response.status);
              return response.json();
            }})
            .then((data) => {{
              try {{
                mapDebug('station_fetch_success', {{ count: Array.isArray(data.items) ? data.items.length : 0 }});
                waitForMapElementSize(() => renderMap(data.items || []));
              }} catch (error) {{
                showMapError('Map render failed: ' + (error && error.message ? error.message : 'unknown error'));
              }}
            }})
            .catch((error) => {{
              showMapError('Station data load failed: ' + (error && error.message ? error.message : 'network error'));
            }});
          setTimeout(() => {{
            if (!window.__naverMapReady) {{
              showMapError('Naver map did not initialize. Check Web service URL and API key restrictions.');
            }}
          }}, 6000);
        }});
      }}

      window.__startNaverMap = function() {{
        mapDebug('naver_sdk_callback');
        waitForNaverMaps(startMapAfterSdkReady);
      }};

      if ('{client_id}') {{
        mapDebug('naver_sdk_script_append', {{ hasClientId: true }});
        const sdkScript = document.createElement('script');
        sdkScript.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId={client_id}&submodules=geocoder&callback=__startNaverMap';
        sdkScript.async = true;
        sdkScript.onerror = function() {{
          mapDebug('naver_sdk_script_error');
          showMapError('Naver Maps SDK script failed to load. Check network and Dynamic Map settings.');
        }};
        document.head.appendChild(sdkScript);
      }}
    </script>
  </body>
</html>"""
    return HttpResponse(html)

# 시도별 구 → 실제 측정소명 매핑
STATION_MAPPING = {
    '서울': {
        '강남구': '강남구',
        '강동구': '강동구',
        '강북구': '강북구',
        '강서구': '강서구',
        '관악구': '관악구',
        '광진구': '광진구',
        '구로구': '구로구',
        '금천구': '금천구',
        '노원구': '노원구',
        '도봉구': '도봉구',
        '동대문구': '동대문구',
        '동작구': '동작구',
        '마포구': '마포구',
        '서대문구': '서대문구',
        '서초구': '서초구',
        '성동구': '성동구',
        '성북구': '성북구',
        '송파구': '송파구',
        '양천구': '양천구',
        '영등포구': '영등포구',
        '용산구': '용산구',
        '은평구': '은평구',
        '종로구': '종로구',
        '중구': '중구',
        '중랑구': '중랑구',
    },
    '부산': {
        '강서구': '명지동',
        '금정구': '금사동',
        '기장군': '기장읍',
        '남구': '용호동',
        '동구': '수정동',
        '동래구': '온천동',
        '부산진구': '전포동',
        '북구': '덕천동',
        '사상구': '삼락동',
        '사하구': '당리동',
        '서구': '감천동',
        '수영구': '광안동',
        '연제구': '연산동',
        '영도구': '태종대',
        '중구': '광복동',
        '해운대구': '재송동',
    },
    '대구': {
        '남구': '대명동',
        '달서구': '다사읍',
        '달성군': '유가읍',
        '동구': '침산동',
        '북구': '산격동',
        '서구': '내당동',
        '수성구': '만촌동',
        '중구': '중앙로',
    },
    '인천': {
        '계양구': '계산',
        '남동구': '남동',
        '동구': '숭의',
        '부평구': '부평역',
        '서구': '검단',
        '연수구': '송도동',
        '중구': '영종',
        '미추홀구': '주안',
    },
    '광주': {
        '광산구': '송정동',
        '남구': '주월동',
        '동구': '두암동',
        '북구': '우산동(광주)',
        '서구': '치평동',
    },
    '대전': {
        '대덕구': '비래동',
        '동구': '대성동',
        '서구': '둔산동',
        '유성구': '노은동',
        '중구': '월평동',
    },
    '울산': {
        '남구': '무거동',
        '동구': '전하동',
        '북구': '농소동',
        '울주군': '범서읍',
        '중구': '중앙동(경기)',
    },
    '세종': {
        '세종시': '아름동',
    },
    '경기': {
        '가평군': '가평',
        '고양시': '백석동',
        '과천시': '과천동',
        '광명시': '소하동',
        '광주시': '경안동',
        '구리시': '교문동',
        '군포시': '산본동',
        '김포시': '고촌읍',
        '남양주시': '별내동',
        '동두천시': '생연동',
        '부천시': '소사본동',
        '성남시': '성남동',
        '수원시': '고색동',
        '시흥시': '정왕동',
        '안산시': '초지동',
        '안성시': '공도읍',
        '안양시': '안양2동',
        '양주시': '고읍',
        '양평군': '양평읍',
        '여주시': '김량장동',
        '연천군': '연천',
        '오산시': '오산동',
        '용인시': '기흥',
        '의왕시': '고천동',
        '의정부시': '의정부동',
        '이천시': '장호원읍',
        '파주시': '파주읍',
        '평택시': '비전동',
        '포천시': '관인면',
        '하남시': '감일',
        '화성시': '봉담읍',
    },
    '강원': {
        '강릉시': '주문진읍',
        '고성군': '간성읍',
        '동해시': '동해항',
        '삼척시': '삼척항',
        '속초시': '조양동',
        '양구군': '양구읍',
        '양양군': '양양읍',
        '영월군': '영월읍',
        '원주시': '문막읍',
        '인제군': '인제읍',
        '정선군': '정선읍',
        '철원군': '갈말읍',
        '춘천시': '신사우동',
        '태백시': '황지동',
        '평창군': '평창읍',
        '홍천군': '홍천읍',
        '화천군': '화천읍',
        '횡성군': '횡성읍',
    },
    '충북': {
        '괴산군': '괴산읍',
        '단양군': '단양읍',
        '보은군': '보은읍',
        '영동군': '영동읍',
        '옥천군': '옥천읍',
        '음성군': '음성읍',
        '제천시': '청풍면',
        '진천군': '진천읍',
        '청주시': '복대동',
        '충주시': '칠금동',
        '증평군': '증평읍',
    },
    '충남': {
        '공주시': '공주',
        '금산군': '금산읍',
        '논산시': '논산',
        '당진시': '당진시청사',
        '보령시': '대천2동',
        '부여군': '부여읍',
        '서산시': '성연면',
        '서천군': '서천읍',
        '아산시': '배방읍',
        '예산군': '예산군',
        '천안시': '성성동',
        '청양군': '청양읍',
        '태안군': '태안읍',
        '홍성군': '홍성읍',
        '계룡시': '두마면',
    },
    '전북': {
        '고창군': '고창읍',
        '군산시': '소룡동',
        '김제시': '요촌동',
        '남원시': '남원읍',
        '무주군': '무주읍',
        '부안군': '부안읍',
        '순창군': '순창읍',
        '완주군': '봉동읍',
        '익산시': '영등동',
        '임실군': '임실읍',
        '장수군': '장수읍',
        '전주시': '노송동',
        '정읍시': '신태인',
        '진안군': '진안읍',
    },
    '전남': {
        '강진군': '강진읍',
        '고흥군': '고흥읍',
        '곡성군': '곡성읍',
        '광양시': '광양읍',
        '구례군': '구례읍',
        '나주시': '빛가람동',
        '담양군': '담양읍',
        '목포시': '목포항',
        '무안군': '무안읍',
        '보성군': '보성읍',
        '순천시': '순천만',
        '신안군': '신안군',
        '여수시': '여수항',
        '영광군': '영광읍',
        '영암군': '영암읍',
        '완도군': '완도읍',
        '장성군': '장성읍',
        '장흥군': '장흥읍',
        '진도군': '진도읍',
        '함평군': '함평읍',
        '해남군': '해남읍',
        '화순군': '화순읍',
    },
    '경북': {
        '경산시': '시지동',
        '경주시': '외동읍',
        '구미시': '형곡동',
        '김천시': '율곡동',
        '문경시': '문경시',
        '봉화군': '봉화군청',
        '상주시': '상주시',
        '성주군': '성주군',
        '안동시': '신안동',
        '영덕군': '영덕읍',
        '영양군': '영양군',
        '영주시': '영주동',
        '영천시': '영천시',
        '예천군': '예천군',
        '울릉군': '울릉읍',
        '울진군': '울진군',
        '의성군': '의성읍',
        '청도군': '청도읍',
        '청송군': '청송읍',
        '칠곡군': '칠곡군',
        '포항시': '포항항',
    },
    '경남': {
        '거제시': '고현동',
        '거창군': '거창읍',
        '고성군': '고성읍',
        '김해시': '장유동',
        '남해군': '남해읍',
        '밀양시': '내일동',
        '사천시': '사천읍',
        '산청군': '산청읍',
        '양산시': '물금읍',
        '의령군': '의령읍',
        '진주시': '상대동(진주)',
        '창녕군': '창녕읍',
        '창원시': '회원동',
        '통영시': '무전동',
        '하동군': '하동읍',
        '함안군': '함안읍',
        '함양군': '함양읍',
        '합천군': '합천읍',
    },
    '제주': {
        '서귀포시': '동홍동',
        '제주시': '이도동',
    },
}

def _to_float(value):
    try:
        if value in (None, '', '-'):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None

def _clean_station_name(value):
    return (value or '').strip()

def _station_lookup_name(value):
    return _clean_station_name(value).replace(' ', '')

def _region_lookup_tokens(region):
    compact = _station_lookup_name(region)
    tokens = [compact]
    for suffix in ('특별시', '광역시', '특별자치시', '특별자치도', '자치도', '시', '군', '구', '읍', '면', '동'):
        if compact.endswith(suffix) and len(compact) > len(suffix):
            tokens.append(compact[:-len(suffix)])
    return [token for index, token in enumerate(tokens) if token and token not in tokens[:index]]

def _candidate_stations_for_region(city, region):
    mapping_name = STATION_MAPPING.get(city, {}).get(region)
    candidates = []
    if mapping_name:
        candidates.extend(AirQualityStation.objects.filter(sido=city, name=mapping_name, is_active=True))

    tokens = _region_lookup_tokens(region)
    stations = AirQualityStation.objects.filter(sido=city, is_active=True)
    for station in stations:
        lookup_name = _station_lookup_name(station.name)
        lookup_addr = _station_lookup_name(station.addr)
        if lookup_name == _station_lookup_name(region) or any(token in lookup_name or token in lookup_addr for token in tokens):
            candidates.append(station)

    unique = {}
    for station in candidates:
        unique[station.id] = station
    return list(unique.values())

def _resolve_station_name(city, region):
    mapped = STATION_MAPPING.get(city, {}).get(region)
    if mapped:
        return mapped
    candidates = _candidate_stations_for_region(city, region)
    return candidates[0].name if candidates else region

def _first_valid_value(*values):
    for value in values:
        if value not in (None, '', '-'):
            return value
    return None

def _normalize_wgs84_coordinates(dm_x, dm_y):
    x = _to_float(dm_x)
    y = _to_float(dm_y)
    if x is None or y is None:
        return None, None

    if abs(x) > 90 and abs(y) <= 90:
        return y, x
    return x, y

def _extract_airkorea_items(data):
    items = data.get("response", {}).get("body", {}).get("items", [])
    if isinstance(items, dict):
        items = items.get("item", [])
    return items if isinstance(items, list) else []

def _airkorea_result(data):
    header = data.get("response", {}).get("header", {})
    return {
        "resultCode": header.get("resultCode"),
        "resultMsg": header.get("resultMsg"),
    }

def _parse_airkorea_response(response):
    try:
        data = response.json()
        return _extract_airkorea_items(data), _airkorea_result(data), None
    except ValueError:
        pass

    text = response.text.strip()
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return [], {}, text[:120]

    result = {
        "resultCode": root.findtext(".//resultCode"),
        "resultMsg": root.findtext(".//resultMsg") or root.findtext(".//returnAuthMsg"),
    }
    items = []
    for item in root.findall(".//item"):
        items.append({child.tag: child.text for child in item})

    return items, result, None

def _station_request_variants(addr):
    key_variants = []
    for key in (AIRKOREA_SERVICE_KEY, API_KEY):
        if key and key not in key_variants:
            key_variants.append(key)

    base_params = {
        "returnType": "json",
        "numOfRows": "1000",
        "pageNo": "1",
        "addr": addr,
    }
    variants = []
    for key in key_variants:
        variants.append({
            "label": "serviceKey/json/ver1.1",
            "params": {**base_params, "serviceKey": key, "stationName": "", "ver": "1.1"},
        })
    return variants

def _fetch_station_locations_for_sido(sido):
    stations = {}
    debug = []
    found_for_sido = False
    for addr in SIDO_STATION_ADDR_ALIASES.get(sido, [sido]):
        items = []
        for variant in _station_request_variants(addr):
            raw_error = None
            try:
                response = requests.get(STATION_INFO_URL, params=variant["params"], headers=AIRKOREA_HEADERS, timeout=15)
                items, result, raw_error = _parse_airkorea_response(response)
                debug.append({
                    "sido": sido,
                    "addr": addr,
                    "variant": variant["label"],
                    "status": response.status_code,
                    "items": len(items),
                    **({"raw_error": raw_error} if raw_error else {}),
                    **result,
                })
            except Exception as exc:
                items = []
                debug.append({
                    "sido": sido,
                    "addr": addr,
                    "variant": variant["label"],
                    "status": "request_failed",
                    "items": 0,
                    "error": str(exc)[:120],
                })

            if items:
                break
            if raw_error and "quota exceeded" in raw_error.lower():
                break

        for item in items:
            name = _clean_station_name(item.get('stationName'))
            lat, lng = _normalize_wgs84_coordinates(item.get('dmX'), item.get('dmY'))
            if not name or lat is None or lng is None:
                continue
            stations[f'{sido}:{name}'] = {
                "name": name,
                "sido": sido,
                "addr": item.get('addr') or '',
                "lat": lat,
                "lng": lng,
            }

        if items:
            found_for_sido = True
            break

    if not found_for_sido:
        debug.append({"sido": sido, "items": 0, "message": "No station location rows returned for this sido."})
    return stations, debug

def _load_station_locations(allow_api=False):
    cache_key = 'airkorea_station_locations_v6'
    cached = cache.get(cache_key)
    if cached:
        return cached, [{"cached": True, "count": len(cached)}]

    db_stations = _load_station_locations_from_db()
    if db_stations:
        cache.set(cache_key, db_stations, 60 * 60)
        return db_stations, [{"source": "db", "count": len(db_stations)}]

    if not allow_api:
        return {}, [{"source": "db", "count": 0, "message": "No station rows in DB."}]

    stations = {}
    debug = []
    with ThreadPoolExecutor(max_workers=AIRKOREA_REQUEST_WORKERS) as executor:
        futures = [executor.submit(_fetch_station_locations_for_sido, sido) for sido in SIDO_NAMES]
        for future in as_completed(futures):
            sido_stations, sido_debug = future.result()
            stations.update(sido_stations)
            debug.extend(sido_debug)

    if stations:
        _store_station_locations_to_db(stations)
        cache.set(cache_key, stations, 60 * 60 * 24)
    return stations, debug

def _load_station_locations_from_db():
    stations = {}
    for station in AirQualityStation.objects.filter(is_active=True):
        stations[f'{station.sido}:{station.name}'] = {
            "name": station.name,
            "sido": station.sido,
            "addr": station.addr,
            "lat": station.lat,
            "lng": station.lng,
        }
    return stations

def _store_station_locations_to_db(stations):
    for location in stations.values():
        AirQualityStation.objects.update_or_create(
            sido=location["sido"],
            name=location["name"],
            defaults={
                "addr": location.get("addr") or "",
                "lat": location["lat"],
                "lng": location["lng"],
                "is_active": True,
                "raw_data": location,
            },
        )

def _fetch_realtime_station_values_for_sido(sido):
    key_variants = []
    for key in (AIRKOREA_SERVICE_KEY, API_KEY):
        if key and key not in key_variants:
            key_variants.append(key)

    request_variants = []
    for key in key_variants:
        request_variants.append(("serviceKey/json/ver1.0", {
            "serviceKey": key,
            "returnType": "json",
            "numOfRows": "1000",
            "pageNo": "1",
            "sidoName": sido,
            "ver": "1.0",
        }))

    active_stations = list(AirQualityStation.objects.filter(is_active=True))
    items = []
    debug = []
    if not request_variants:
        debug.append({"sido": sido, "items": 0, "error": "AirKorea service key is not configured."})
    for label, params in request_variants:
        raw_error = None
        try:
            response = requests.get(REALTIME_DUST_URL, params=params, headers=AIRKOREA_HEADERS, timeout=15)
            items, result, raw_error = _parse_airkorea_response(response)
            debug.append({
                "sido": sido,
                "variant": label,
                "status": response.status_code,
                "items": len(items),
                **({"raw_error": raw_error} if raw_error else {}),
                **result,
            })
        except Exception as exc:
            items = []
            debug.append({
                "sido": sido,
                "variant": label,
                "status": "request_failed",
                "items": 0,
                "error": str(exc)[:120],
            })
        if items:
            break
        if raw_error and "quota exceeded" in raw_error.lower():
            break

    values = {}
    for item in items:
        name = _clean_station_name(item.get('stationName'))
        if not name:
            continue
        aqi = _first_valid_value(item.get('khaiValue'), item.get('pm10Value'), item.get('pm25Value'))
        values[f'{sido}:{name}'] = {
            "name": name,
            "sido": sido,
            "aqi": aqi,
            "pm10": item.get('pm10Value'),
            "pm25": item.get('pm25Value'),
            "no2": item.get('no2Value'),
            "o3": item.get('o3Value'),
            "temp": '-',
            "humidity": '-',
            "time": item.get('dataTime') or '',
        }
    return values, debug

def _load_realtime_station_values(with_debug=False, allow_api=False):
    cache_key = 'airkorea_realtime_station_values_v4'
    cached = cache.get(cache_key)
    if cached:
        if with_debug:
            return cached, [{"cached": True, "count": len(cached)}]
        return cached

    db_values = _load_latest_realtime_values_from_db()
    if db_values:
        cache.set(cache_key, db_values, 60 * 10)
        if with_debug:
            return db_values, [{"source": "db", "count": len(db_values)}]
        return db_values

    if not allow_api:
        if with_debug:
            return {}, [{"source": "db", "count": 0, "message": "No recent realtime rows in DB."}]
        return {}

    values = {}
    debug = []
    with ThreadPoolExecutor(max_workers=AIRKOREA_REQUEST_WORKERS) as executor:
        futures = [executor.submit(_fetch_realtime_station_values_for_sido, sido) for sido in SIDO_NAMES]
        for future in as_completed(futures):
            sido_values, sido_debug = future.result()
            values.update(sido_values)
            debug.extend(sido_debug)

    if values:
        cache.set(cache_key, values, 60 * 10)
    if with_debug:
        return values, debug
    return values

def _parse_airkorea_datetime(value):
    if not value:
        return None
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text)
        if timezone.is_naive(parsed):
            return timezone.make_aware(parsed, timezone.get_current_timezone())
        return parsed
    except ValueError:
        pass
    for fmt in ('%Y-%m-%d %H:%M', '%Y-%m-%d %H:%M:%S', '%Y%m%d%H%M'):
        try:
            parsed = datetime.strptime(text, fmt)
            if timezone.is_naive(parsed):
                return timezone.make_aware(parsed, timezone.get_current_timezone())
            return parsed
        except ValueError:
            continue
    return None

def _load_latest_realtime_values_from_db(max_age_hours=24):
    cutoff = timezone.now() - timedelta(hours=max_age_hours)
    measurements = (
        RealtimeDustMeasurement.objects
        .select_related('station')
        .filter(measured_at__gte=cutoff, station__is_active=True)
        .order_by('station_id', '-measured_at')
    )
    values = {}
    for measurement in measurements:
        station = measurement.station
        key = f'{station.sido}:{station.name}'
        existing = values.get(key)
        if not existing:
            existing = {
                "name": station.name,
                "sido": station.sido,
                "aqi": None,
                "pm10": None,
                "pm25": None,
                "no2": None,
                "o3": None,
                "temp": "-",
                "humidity": "-",
                "time": timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M'),
                "pm10_time": None,
                "pm25_time": None,
                "no2_time": None,
                "o3_time": None,
                "source": "stored_realtime",
            }
            values[key] = existing

        if existing["aqi"] is None and measurement.aqi_value is not None:
            existing["aqi"] = measurement.aqi_value
        if existing["pm10"] is None and measurement.pm10_value is not None:
            existing["pm10"] = measurement.pm10_value
            existing["pm10_time"] = timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M')
        if existing["pm25"] is None and measurement.pm25_value is not None:
            existing["pm25"] = measurement.pm25_value
            existing["pm25_time"] = timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M')
        if existing["no2"] is None and measurement.no2_value is not None:
            existing["no2"] = measurement.no2_value
            existing["no2_time"] = timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M')
        if existing["o3"] is None and measurement.o3_value is not None:
            existing["o3"] = measurement.o3_value
            existing["o3_time"] = timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M')
    return values

def _latest_weather_by_grid_for_locations(station_locations, max_age_hours=24):
    cutoff = timezone.now() - timedelta(hours=max_age_hours)
    grids = {}
    for location in station_locations.values():
        grid = _dfs_grid_from_lat_lng(location.get("lat"), location.get("lng"))
        grids[(grid["nx"], grid["ny"])] = grid

    if not grids:
        return {}

    rows = (
        WeatherHourlyMeasurement.objects
        .filter(measured_at__gte=cutoff, nx__in=[grid["nx"] for grid in grids.values()], ny__in=[grid["ny"] for grid in grids.values()])
        .order_by('nx', 'ny', '-measured_at')
    )
    latest = {}
    for row in rows:
        key = (row.nx, row.ny)
        if key in latest:
            continue
        measured_at = timezone.localtime(row.measured_at)
        latest[key] = {
            "weatherTemperature": row.temperature,
            "weatherHumidity": row.humidity,
            "weatherWindSpeed": row.wind_speed,
            "weatherWindDirection": row.wind_direction,
            "weatherRainMm": row.rain_mm,
            "weatherLabel": row.label,
            "weatherTime": measured_at.strftime('%Y-%m-%d %H:%M'),
        }
    return latest

def _find_station_for_realtime_value(value):
    sido = value.get("sido")
    name = _clean_station_name(value.get("name"))
    if not sido or not name:
        return None

    station = _find_air_quality_station(sido, name)
    if station:
        return station
    return None

def _find_air_quality_station(sido, station_name):
    if not sido or not station_name:
        return None

    station = AirQualityStation.objects.filter(sido=sido, name=station_name, is_active=True).first()
    if station:
        return station

    lookup_name = _station_lookup_name(station_name)
    for station in AirQualityStation.objects.filter(sido=sido, is_active=True):
        if _station_lookup_name(station.name) == lookup_name:
            return station
    return None

def _store_realtime_values_to_db(values):
    saved = 0
    for key, value in values.items():
        station = _find_station_for_realtime_value(value)
        if not station:
            continue
        measured_at = _parse_airkorea_datetime(value.get("time")) or timezone.now().replace(minute=0, second=0, microsecond=0)
        _, created = RealtimeDustMeasurement.objects.update_or_create(
            station=station,
            measured_at=measured_at,
            defaults={
                "pm10_value": _to_float(value.get("pm10")),
                "pm25_value": _to_float(value.get("pm25")),
                "o3_value": _to_float(value.get("o3")),
                "no2_value": _to_float(value.get("no2")),
                "aqi_value": _to_float(value.get("aqi")),
                "raw_data": value,
            },
        )
        if created:
            saved += 1
    return saved

def _load_latest_daily_station_values():
    cache_key = 'latest_daily_station_values_v1'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    values = {}
    rows = (
        DustMeasurement.objects
        .exclude(station_name__isnull=True)
        .exclude(station_name='')
        .order_by('-measured_date', '-updated_at')
        .values(
            'city',
            'region',
            'station_name',
            'measured_date',
            'pm10_value',
            'pm25_value',
            'o3_value',
            'no2_value',
        )
    )
    for row in rows:
        city = row.get('city') or ''
        names = [
            row.get('station_name') or '',
            row.get('region') or '',
        ]
        for name in names:
            lookup_name = _station_lookup_name(name)
            if not city or not lookup_name:
                continue
            key = f'{city}:{lookup_name}'
            if key in values:
                continue
            measured_date = row.get('measured_date')
            measured_label = measured_date.isoformat() if measured_date else ''
            values[key] = {
                "name": name,
                "sido": city,
                "aqi": row.get('pm10_value'),
                "pm10": row.get('pm10_value'),
                "pm25": row.get('pm25_value'),
                "no2": row.get('no2_value'),
                "o3": row.get('o3_value'),
                "temp": "-",
                "humidity": "-",
                "time": f"{measured_label} 일평균" if measured_label else "최신 일평균",
                "source": "stored_daily_latest",
            }

    cache.set(cache_key, values, 60 * 10)
    return values

def _has_usable_realtime_values(item):
    return any(_first_valid_value(item.get(key)) for key in ('pm10', 'pm25', 'o3', 'no2'))

def _has_usable_station_item(item):
    return any(_first_valid_value(item.get(key)) for key in ('pm10Value', 'pm25Value', 'o3Value', 'no2Value'))

def _station_realtime_to_current_item(item, city, region, station_name, source):
    return {
        "cityName": region,
        "dataTime": item.get("time") or item.get("dataTime") or "",
        "pm10Time": item.get("pm10_time") or item.get("pm10Time"),
        "pm25Time": item.get("pm25_time") or item.get("pm25Time"),
        "o3Time": item.get("o3_time") or item.get("o3Time"),
        "no2Time": item.get("no2_time") or item.get("no2Time"),
        "pm10Value": item.get("pm10") or item.get("pm10Value"),
        "pm25Value": item.get("pm25") or item.get("pm25Value"),
        "o3Value": item.get("o3") or item.get("o3Value"),
        "no2Value": item.get("no2") or item.get("no2Value"),
        "stationName": item.get("name") or item.get("stationName") or station_name,
        "city": city,
        "region": region,
        "source": source,
    }

def _find_current_realtime_value(city, region, station_name, realtime_values):
    lookup_station = _station_lookup_name(station_name)
    current = realtime_values.get(f'{city}:{station_name}')
    if current and _has_usable_realtime_values(current):
        return current

    for value in realtime_values.values():
        if value.get("sido") == city and _station_lookup_name(value.get("name")) == lookup_station and _has_usable_realtime_values(value):
            return value

    candidate_names = {_station_lookup_name(station.name) for station in _candidate_stations_for_region(city, region)}
    for value in realtime_values.values():
        if value.get("sido") == city and _station_lookup_name(value.get("name")) in candidate_names and _has_usable_realtime_values(value):
            return value
    return None

def _fetch_recent_station_realtime_items(station_name):
    cache_key = f'airkorea_station_realtime_recent_v1_{station_name}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached, None

    params = {
        "serviceKey": AIRKOREA_SERVICE_KEY,
        "returnType": "json",
        "numOfRows": "24",
        "pageNo": "1",
        "stationName": station_name,
        "dataTerm": "DAILY",
        "ver": "1.3",
    }
    try:
        response = requests.get(STATION_REALTIME_DUST_URL, params=params, headers=AIRKOREA_HEADERS, timeout=15)
        items, result, raw_error = _parse_airkorea_response(response)
        api_error = None
        if response.status_code >= 400 or raw_error:
            api_error = raw_error or result.get("resultMsg") or f"AirKorea status {response.status_code}"
        cache.set(cache_key, items, 60 * 5)
        return items, api_error
    except Exception as exc:
        return [], str(exc)

def _past_item_to_current_item(item, city, region, station_name):
    return {
        "cityName": region,
        "dataTime": f"{item.get('msurDt')} 일평균 기준",
        "pm10Value": item.get("pm10Value"),
        "pm25Value": item.get("pm25Value"),
        "o3Value": item.get("o3Value"),
        "no2Value": item.get("no2Value"),
        "stationName": item.get("msrstnName") or station_name,
        "city": city,
        "region": region,
        "source": "past_latest",
    }

@api_view(['POST'])
def register_notification_device(request):
    try:
        device = upsert_notification_device(request.data)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)
    return Response(notification_device_response(device))

@api_view(['POST'])
def mobile_map_client_log(request):
    """Print WebView map diagnostics without storing API keys or token values."""
    body = request.data if isinstance(request.data, dict) else {}
    event = str(body.get("event") or "unknown")[:80]
    details = body.get("details") if isinstance(body.get("details"), dict) else {}
    safe_details = {
        str(key)[:50]: str(value)[:200]
        for key, value in details.items()
        if "token" not in str(key).lower() and "key" not in str(key).lower()
    }
    href = re.sub(r"app_test_token=[^&]+", "app_test_token=[hidden]", str(body.get("href") or ""))[:300]
    user_agent = str(body.get("userAgent") or "")[:200]
    print(f"[mobile-map] event={event} details={safe_details} href={href} userAgent={user_agent}", flush=True)
    return Response({"ok": True})

@api_view(['GET'])
def current_dust(request):
    city = request.GET.get('city') or '서울'
    region = request.GET.get('region') or '송파구'
    station_name = _resolve_station_name(city, region)
    if not request.GET.get('city'):
        city = '서울'
    if not request.GET.get('region'):
        region = '송파구'
    station_name = _resolve_station_name(city, region)

    try:
        realtime_values, realtime_debug = _load_realtime_station_values(with_debug=True)
        latest_daily_values = _load_latest_daily_station_values()
        current = _find_current_realtime_value(city, region, station_name, realtime_values)

        if current and _has_usable_realtime_values(current):
            return Response({
                "item": _station_realtime_to_current_item(current, city, region, station_name, "realtime_current"),
                "basis": "realtime_current",
            })

        city = request.GET.get('city') or '서울'
        region = request.GET.get('region') or '송파구'
        station_name = _resolve_station_name(city, region)
        latest_daily = latest_daily_values.get(f'{city}:{_station_lookup_name(station_name)}')
        if latest_daily and _has_usable_realtime_values(latest_daily):
            return Response({
                "item": _station_realtime_to_current_item(latest_daily, city, region, station_name, "stored_daily_latest"),
                "basis": "past_latest",
                "notice": "저장된 최신 일평균 값을 표시합니다.",
            })

        return Response({
            "item": None,
            "basis": "none",
            "error": "No stored current or recent dust values.",
        }, status=404)

        recent_items, recent_error = _fetch_recent_station_realtime_items(station_name)
        recent_candidates = [item for item in recent_items if _has_usable_station_item(item)]
        recent_candidates.sort(key=lambda item: item.get("dataTime") or "", reverse=True)
        recent_item = recent_candidates[0] if recent_candidates else None
        if recent_item:
            return Response({
                "item": _station_realtime_to_current_item(recent_item, city, region, station_name, "realtime_recent"),
                "basis": "realtime_recent",
            })

        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        past_items, past_error = _fetch_past_dust_items_by_station(station_name, start_date, end_date)
        past_candidates = [item for item in past_items if _has_usable_station_item(item)]
        past_candidates.sort(key=lambda item: item.get("msurDt") or "")
        latest_past = past_candidates[-1] if past_candidates else None
        if latest_past:
            return Response({
                "item": _past_item_to_current_item(latest_past, city, region, station_name),
                "basis": "past_latest",
                "notice": "현재 시간대 측정값과 직전 시간 측정값이 없어 최신 일평균 값을 표시합니다.",
            })

        return Response({
            "item": None,
            "basis": "none",
            "error": recent_error or past_error or "No current or recent dust values.",
        }, status=404)
    except Exception as exc:
        return Response({"error": str(exc)}, status=500)

@api_view(['GET'])
def korea_station_dust(request):
    try:
        cache_key = 'korea_station_dust_response_v2'
        cached_response = cache.get(cache_key)
        if cached_response is not None:
            return Response(cached_response)

        station_locations, location_debug = _load_station_locations()
        realtime_values, realtime_debug = _load_realtime_station_values(with_debug=True)
        latest_daily_values = _load_latest_daily_station_values()
        latest_weather_by_grid = _latest_weather_by_grid_for_locations(station_locations)
        location_by_sido = {}
        realtime_by_sido = {}
        station_by_sido = {}

        for location in station_locations.values():
            location_by_sido[location["sido"]] = location_by_sido.get(location["sido"], 0) + 1

        for value in realtime_values.values():
            realtime_by_sido[value["sido"]] = realtime_by_sido.get(value["sido"], 0) + 1

        realtime_values_by_name = {}
        for value in realtime_values.values():
            lookup_name = _station_lookup_name(value.get("name") or value.get("stationName"))
            if lookup_name and lookup_name not in realtime_values_by_name:
                realtime_values_by_name[lookup_name] = value

        stations = []
        matched_by_key = 0
        matched_by_name = 0
        for key, location in station_locations.items():
            grid = _dfs_grid_from_lat_lng(location["lat"], location["lng"])
            weather_values = latest_weather_by_grid.get((grid["nx"], grid["ny"]), {})
            values = realtime_values.get(key)
            if values:
                matched_by_key += 1
            else:
                values = realtime_values_by_name.get(_station_lookup_name(location["name"]))
                if values:
                    matched_by_name += 1
            if not values:
                values = latest_daily_values.get(f'{location["sido"]}:{_station_lookup_name(location["name"])}')
            if not values:
                values = {
                    "name": location["name"],
                    "sido": location["sido"],
                    "aqi": None,
                    "pm10": "-",
                    "pm25": "-",
                    "no2": "-",
                    "o3": "-",
                    "temp": "-",
                    "humidity": "-",
                    "time": "",
                }
            stations.append({
                **location,
                **values,
                **weather_values,
                "city": location["name"],
            })
            station_by_sido[location["sido"]] = station_by_sido.get(location["sido"], 0) + 1

        response_data = {
            "count": len(stations),
            "items": stations,
            "basis": "nearest_airkorea_station",
            "debug": {
                "station_locations": len(station_locations),
                "realtime_values": len(realtime_values),
                "matched_by_key": matched_by_key,
                "matched_by_name": matched_by_name,
                "location_by_sido": location_by_sido,
                "realtime_by_sido": realtime_by_sido,
                "station_by_sido": station_by_sido,
                "station_location_requests": location_debug[:12],
                "realtime_requests": realtime_debug[:12],
                "airkorea_key_configured": bool(AIRKOREA_SERVICE_KEY),
                "latest_daily_values": len(latest_daily_values),
                "latest_weather_grids": len(latest_weather_by_grid),
            },
        }
        cache.set(cache_key, response_data, 60)
        return Response(response_data)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

def _fetch_past_dust_items_by_station(station_name, start_date, end_date, allow_api=False):
    if not allow_api:
        return [], "External API calls are disabled for request-time reads."

    cache_key = f'airkorea_past_station_v1_{station_name}_{start_date:%Y%m%d}_{end_date:%Y%m%d}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached, None

    params = {
        "serviceKey": AIRKOREA_SERVICE_KEY,
        "returnType": "json",
        "numOfRows": "1000",
        "pageNo": "1",
        "inqBginDt": start_date.strftime('%Y%m%d'),
        "inqEndDt": end_date.strftime('%Y%m%d'),
        "msrstnName": station_name,
    }
    try:
        response = requests.get(API_URL, params=params, headers=AIRKOREA_HEADERS, timeout=15)
        items, result, raw_error = _parse_airkorea_response(response)
        api_error = None
        if response.status_code >= 400 or raw_error:
            api_error = raw_error or result.get("resultMsg") or f"AirKorea status {response.status_code}"
        cache.set(cache_key, items, 60 * 60)
        return items, api_error
    except Exception as exc:
        return [], str(exc)

def _haversine_km(lat1, lng1, lat2, lng2):
    radius = 6371
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return radius * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))

def _dfs_grid_from_lat_lng(lat, lng):
    re = 6371.00877
    grid = 5.0
    slat1 = 30.0
    slat2 = 60.0
    olon = 126.0
    olat = 38.0
    xo = 43
    yo = 136

    degrad = math.pi / 180.0
    re_grid = re / grid
    slat1_rad = slat1 * degrad
    slat2_rad = slat2 * degrad
    olon_rad = olon * degrad
    olat_rad = olat * degrad

    sn = math.tan(math.pi * 0.25 + slat2_rad * 0.5) / math.tan(math.pi * 0.25 + slat1_rad * 0.5)
    sn = math.log(math.cos(slat1_rad) / math.cos(slat2_rad)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1_rad * 0.5)
    sf = (sf ** sn) * math.cos(slat1_rad) / sn
    ro = math.tan(math.pi * 0.25 + olat_rad * 0.5)
    ro = re_grid * sf / (ro ** sn)

    ra = math.tan(math.pi * 0.25 + lat * degrad * 0.5)
    ra = re_grid * sf / (ra ** sn)
    theta = lng * degrad - olon_rad
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn

    return {
        "nx": int(ra * math.sin(theta) + xo + 0.5),
        "ny": int(ro - ra * math.cos(theta) + yo + 0.5),
    }

def _kma_ultra_short_base_datetime(now=None):
    current = now or datetime.now()
    if current.minute < 45:
        current = current - timedelta(hours=1)
    return current.strftime("%Y%m%d"), current.strftime("%H30"), current.strftime("%H00")

def _kma_ultra_short_base_datetime_candidates(limit=4):
    current = datetime.now()
    candidates = []
    for _ in range(limit):
        base_date, base_time, current_time = _kma_ultra_short_base_datetime(current)
        candidate = (base_date, base_time, current_time)
        if candidate not in candidates:
            candidates.append(candidate)
        current = current - timedelta(hours=1)
    return candidates

def _kma_ultra_short_nowcast_base_datetime(now=None):
    current = now or datetime.now()
    if current.minute < 10:
        current = current - timedelta(hours=1)
    return current.strftime("%Y%m%d"), current.strftime("%H00")

def _kma_ultra_short_nowcast_base_datetime_candidates(limit=4):
    current = datetime.now()
    candidates = []
    for _ in range(limit):
        base_date, base_time = _kma_ultra_short_nowcast_base_datetime(current)
        candidate = (base_date, base_time)
        if candidate not in candidates:
            candidates.append(candidate)
        current = current - timedelta(hours=1)
    return candidates

def _kma_current_weather_label(pty, sky):
    pty_text = str(pty or "0")
    sky_text = str(sky or "")
    if pty_text != "0":
        if pty_text in ("3", "7"):
            return "눈"
        return "비"
    if sky_text == "1":
        return "맑음"
    if sky_text in ("3", "4"):
        return "흐림"
    return "흐림"

def _weather_measured_at_from_key(forecast_key):
    try:
        parsed = datetime.strptime(str(forecast_key), "%Y%m%d%H%M")
    except (TypeError, ValueError):
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed

def _weather_measurement_to_response(measurement, source="stored_weather_hourly"):
    measured_at = timezone.localtime(measurement.measured_at)
    return {
        "label": measurement.label,
        "temperature": measurement.temperature,
        "humidity": measurement.humidity,
        "wind_speed": measurement.wind_speed,
        "wind_direction": measurement.wind_direction,
        "rain_mm": measurement.rain_mm,
        "rain_probability": measurement.rain_probability,
        "sky": measurement.sky,
        "precipitation_type": measurement.precipitation_type,
        "forecast_time": measured_at.strftime("%Y%m%d%H%M"),
        "measured_at": measured_at.isoformat(),
        "grid": {"nx": measurement.nx, "ny": measurement.ny},
        "source": source,
    }

def _store_weather_hourly_measurement(grid, selected_key, selected):
    measured_at = _weather_measured_at_from_key(selected_key)
    if not measured_at:
        return None
    measurement, _ = WeatherHourlyMeasurement.objects.update_or_create(
        nx=grid["nx"],
        ny=grid["ny"],
        measured_at=measured_at,
        defaults={
            "temperature": _to_float(selected.get("T1H")),
            "humidity": _to_float(selected.get("REH")),
            "wind_speed": _to_float(selected.get("WSD")),
            "wind_direction": _to_float(selected.get("VEC")),
            "rain_mm": _to_float(selected.get("RN1")) or _parse_kma_precipitation(selected.get("PCP")),
            "rain_probability": _to_float(selected.get("POP")),
            "sky": str(selected.get("SKY") or ""),
            "precipitation_type": str(selected.get("PTY") or ""),
            "label": _kma_current_weather_label(selected.get("PTY"), selected.get("SKY")),
            "raw_data": selected,
        },
    )
    return measurement

def _forecast_item_time_key(item):
    date_text = str(item.get("date") or "").replace("-", "")
    hour_text = str(item.get("hour") or "").replace(":", "")
    if len(hour_text) == 2:
        hour_text = f"{hour_text}00"
    return f"{date_text}{hour_text[:4]}"

def _future_weather_forecast_items(items, limit=12):
    now_key = timezone.localtime(timezone.now()).strftime("%Y%m%d%H%M")
    return [
        item for item in sorted(items or [], key=_forecast_item_time_key)
        if _forecast_item_time_key(item) > now_key
    ][:limit]

def _fetch_kma_hourly_weather_forecast_by_grid(grid, limit=12):
    if not KMA_API_KEY:
        return []

    cache_key = f"kma_hourly_weather_forecast_v1:{grid['nx']}:{grid['ny']}"
    cached = cache.get(cache_key)
    cached_items = _future_weather_forecast_items(cached, limit)
    if len(cached_items) >= limit:
        return cached_items

    cache_limit = max(limit + 6, 18)
    for base_date, base_time in _kma_base_datetime_candidates():
        params = {
            "serviceKey": KMA_API_KEY,
            "pageNo": "1",
            "numOfRows": "1000",
            "dataType": "JSON",
            "base_date": base_date,
            "base_time": base_time,
            "nx": grid["nx"],
            "ny": grid["ny"],
        }
        try:
            response = requests.get(KMA_VILAGE_FORECAST_URL, params=params, headers=AIRKOREA_HEADERS, timeout=15)
            data = response.json()
        except Exception:
            continue

        header = data.get("response", {}).get("header", {})
        if response.status_code >= 400 or header.get("resultCode") not in (None, "00"):
            continue

        items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]

        grouped = {}
        for item in items:
            fcst_date = str(item.get("fcstDate") or "")
            fcst_time = str(item.get("fcstTime") or "")
            category = str(item.get("category") or "")
            value = item.get("fcstValue")
            if not fcst_date or not fcst_time or not category:
                continue
            grouped.setdefault(f"{fcst_date}{fcst_time}", {})[category] = value

        now_key = timezone.localtime(timezone.now()).strftime("%Y%m%d%H%M")
        forecasts = []
        for forecast_key in sorted(grouped):
            if forecast_key <= now_key:
                continue
            bucket = grouped[forecast_key]
            temperature = _to_float(bucket.get("TMP"))
            if temperature is None:
                continue
            measured_at = _weather_measured_at_from_key(forecast_key)
            if not measured_at:
                continue
            local_time = timezone.localtime(measured_at)
            forecasts.append({
                "measuredAt": local_time.isoformat(),
                "date": local_time.date().isoformat(),
                "hour": local_time.strftime("%H:00"),
                "temperature": temperature,
                "humidity": _to_float(bucket.get("REH")),
                "wind_speed": _to_float(bucket.get("WSD")),
                "wind_direction": _to_float(bucket.get("VEC")),
                "rain_mm": _parse_kma_precipitation(bucket.get("PCP")),
                "rain_probability": _to_float(bucket.get("POP")),
                "label": _kma_current_weather_label(bucket.get("PTY"), bucket.get("SKY")),
                "sky": str(bucket.get("SKY") or ""),
                "precipitation_type": str(bucket.get("PTY") or ""),
                "source": "kma_vilage_forecast",
                "phase": "forecast",
            })
            if len(forecasts) >= cache_limit:
                break
        if forecasts:
            cache.set(cache_key, forecasts, 60 * 45)
            return _future_weather_forecast_items(forecasts, limit)
    return []

def _fetch_kma_temperature_forecast_by_grid(grid, limit=12):
    return _fetch_kma_hourly_weather_forecast_by_grid(grid, limit)


def _nearest_asos_station(lat, lng):
    return min(
        ASOS_STATIONS,
        key=lambda station: _haversine_km(lat, lng, station["lat"], station["lng"]),
    )


def _serialize_asos_daily_item(item):
    return {
        "date": str(item.get("tm") or ""),
        "stationId": str(item.get("stnId") or ""),
        "stationName": str(item.get("stnNm") or ""),
        "avgTemperature": _to_float(item.get("avgTa")),
        "minTemperature": _to_float(item.get("minTa")),
        "maxTemperature": _to_float(item.get("maxTa")),
        "avgHumidity": _to_float(item.get("avgRhm")),
        "avgWindSpeed": _to_float(item.get("avgWs")),
        "maxWindSpeed": _to_float(item.get("maxWs")),
        "rainMm": _to_float(item.get("sumRn")),
        "source": "kma_asos_daily",
    }


def _parse_midterm_announced_at(tm_fc):
    try:
        parsed = datetime.strptime(str(tm_fc), "%Y%m%d%H%M")
    except (TypeError, ValueError):
        return None
    return timezone.make_aware(parsed, timezone.get_current_timezone()) if timezone.is_naive(parsed) else parsed


def _normalize_kma_items(data):
    items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
    if isinstance(items, dict):
        return [items]
    if isinstance(items, list):
        return items
    return []


def _fetch_midterm_api_item(url, reg_id, tm_fc):
    params = {
        "serviceKey": KMA_API_KEY,
        "pageNo": "1",
        "numOfRows": "10",
        "dataType": "JSON",
        "regId": reg_id,
        "tmFc": tm_fc,
    }
    response = requests.get(url, params=params, headers=AIRKOREA_HEADERS, timeout=15)
    if response.status_code >= 400:
        return None
    data = response.json()
    header = data.get("response", {}).get("header", {})
    if header.get("resultCode") not in (None, "00"):
        return None
    items = _normalize_kma_items(data)
    return items[0] if items else None


def _midterm_weather_value(item, day, suffix):
    return item.get(f"wf{day}{suffix}") or item.get(f"wf{day}") or ""


def _midterm_rain_value(item, day, suffix):
    return _to_float(item.get(f"rnSt{day}{suffix}") or item.get(f"rnSt{day}"))


def _store_midterm_forecast_for_region(region, tm_fc):
    if not KMA_API_KEY:
        return 0
    announced_at = _parse_midterm_announced_at(tm_fc)
    if not announced_at:
        return 0

    land_item = _fetch_midterm_api_item(KMA_MID_TERM_LAND_URL, region["land_reg_id"], tm_fc)
    temp_item = _fetch_midterm_api_item(KMA_MID_TERM_TEMPERATURE_URL, region["temp_reg_id"], tm_fc)
    if not land_item and not temp_item:
        return 0

    announced_date = timezone.localtime(announced_at).date()
    saved = 0
    for day in range(3, 11):
        forecast_date = announced_date + timedelta(days=day)
        weather_am = _midterm_weather_value(land_item or {}, day, "Am")
        weather_pm = _midterm_weather_value(land_item or {}, day, "Pm")
        rain_am = _midterm_rain_value(land_item or {}, day, "Am")
        rain_pm = _midterm_rain_value(land_item or {}, day, "Pm")
        WeatherMidTermForecast.objects.update_or_create(
            land_reg_id=region["land_reg_id"],
            temp_reg_id=region["temp_reg_id"],
            announced_at=announced_at,
            forecast_date=forecast_date,
            defaults={
                "region_key": region["key"],
                "region_label": region["label"],
                "min_temperature": _to_float((temp_item or {}).get(f"taMin{day}")),
                "max_temperature": _to_float((temp_item or {}).get(f"taMax{day}")),
                "weather_am": str(weather_am or ""),
                "weather_pm": str(weather_pm or ""),
                "rain_probability_am": rain_am,
                "rain_probability_pm": rain_pm,
                "raw_data": {
                    "tmFc": tm_fc,
                    "land": land_item or {},
                    "temperature": temp_item or {},
                },
            },
        )
        saved += 1
    return saved


def collect_midterm_weather_forecasts(regions=None):
    saved = 0
    for region in regions or MIDTERM_REGIONS:
        for tm_fc in current_midterm_announce_candidates():
            region_saved = _store_midterm_forecast_for_region(region, tm_fc)
            if region_saved:
                saved += region_saved
                break
    return saved


def _serialize_midterm_forecast(item):
    return {
        "date": item.forecast_date.isoformat(),
        "announcedAt": timezone.localtime(item.announced_at).isoformat(),
        "regionKey": item.region_key,
        "regionLabel": item.region_label,
        "landRegId": item.land_reg_id,
        "tempRegId": item.temp_reg_id,
        "minTemperature": item.min_temperature,
        "maxTemperature": item.max_temperature,
        "weatherAm": item.weather_am,
        "weatherPm": item.weather_pm,
        "rainProbabilityAm": item.rain_probability_am,
        "rainProbabilityPm": item.rain_probability_pm,
        "source": "kma_mid_term_forecast",
    }


@api_view(['GET'])
def midterm_weather(request):
    # This endpoint reads stored forecasts only. KMA traffic stays in the scheduled collection command.
    lat = _to_float(request.GET.get("lat"))
    lng = _to_float(request.GET.get("lng"))
    start_date = _parse_measure_date(request.GET.get("startDate")) if request.GET.get("startDate") else timezone.localdate()
    end_date = _parse_measure_date(request.GET.get("endDate")) if request.GET.get("endDate") else timezone.localdate() + timedelta(days=14)
    if lat is None or lng is None:
        return Response({"error": "lat and lng are required."}, status=400)
    if not start_date or not end_date:
        return Response({"error": "startDate/endDate must be YYYYMMDD or YYYY-MM-DD."}, status=400)
    today = timezone.localdate()
    if start_date < today:
        start_date = today
    if end_date < start_date:
        return Response({"region": midterm_region_from_lat_lng(lat, lng), "startDate": start_date.isoformat(), "endDate": end_date.isoformat(), "items": []})

    region = midterm_region_from_lat_lng(lat, lng)
    latest_announced = (
        WeatherMidTermForecast.objects
        .filter(land_reg_id=region["land_reg_id"], temp_reg_id=region["temp_reg_id"])
        .order_by("-announced_at")
        .values_list("announced_at", flat=True)
        .first()
    )
    queryset = WeatherMidTermForecast.objects.filter(
        land_reg_id=region["land_reg_id"],
        temp_reg_id=region["temp_reg_id"],
        forecast_date__gte=start_date,
        forecast_date__lte=end_date,
    )
    if latest_announced:
        queryset = queryset.filter(announced_at=latest_announced)
    items = queryset.order_by("forecast_date")
    return Response({
        "region": region,
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "items": [_serialize_midterm_forecast(item) for item in items],
    })


def _strip_html(value):
    return re.sub(r"<[^>]+>", "", value or "").strip()


def _naver_coord(value):
    number = _to_float(value)
    if number is None:
        return None
    return number / 10000000 if abs(number) > 1000 else number


@api_view(['GET'])
def naver_place_search(request):
    query = (request.GET.get("query") or "").strip()
    if len(query) < 1:
        return Response({"items": []})
    if not NAVER_SEARCH_CLIENT_ID or not NAVER_SEARCH_CLIENT_SECRET:
        return Response({"error": "Naver Search API credentials are not configured."}, status=503)
    try:
        display = max(1, min(int(request.GET.get("size") or 8), 10))
    except (TypeError, ValueError):
        display = 8

    headers = {
        "X-Naver-Client-Id": NAVER_SEARCH_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_SEARCH_CLIENT_SECRET,
    }
    try:
        response = requests.get(NAVER_LOCAL_SEARCH_URL, params={"query": query, "display": display}, headers=headers, timeout=6)
        data = response.json()
    except Exception:
        return Response({"error": "Naver place search failed."}, status=502)

    if response.status_code >= 400:
        return Response({
            "error": "Naver place search failed.",
            "status": response.status_code,
            "naver": data if isinstance(data, dict) else {},
        }, status=502)

    items = []
    for index, item in enumerate(data.get("items") or []):
        lat = _naver_coord(item.get("mapy"))
        lng = _naver_coord(item.get("mapx"))
        if lat is None or lng is None:
            continue
        label = _strip_html(item.get("title")) or item.get("address") or query
        items.append({
            "id": f"naver:{item.get('mapx')}:{item.get('mapy')}:{index}",
            "label": label,
            "address": item.get("roadAddress") or item.get("address") or "",
            "category": item.get("category") or "",
            "lat": lat,
            "lng": lng,
            "source": "naver_local",
        })

    return Response({"items": items})


@api_view(['GET'])
def past_weather(request):
    city = request.GET.get('city')
    district = request.GET.get('region')
    start_date = _parse_measure_date(request.GET.get('startDate'))
    end_date = _parse_measure_date(request.GET.get('endDate'))
    if not city or not district:
        return Response({"error": "city and region are required."}, status=400)
    if not start_date or not end_date:
        return Response({"error": "startDate and endDate must be YYYYMMDD or YYYY-MM-DD."}, status=400)
    if not KMA_API_KEY:
        return Response({"error": "KMA_API_KEY is not configured."}, status=500)

    latest_available_date = timezone.localdate() - timedelta(days=1)
    end_date = min(end_date, latest_available_date)
    if start_date > end_date:
        return Response({"items": [], "notice": "ASOS daily weather data is available through yesterday."})

    station_name = _resolve_station_name(city, district)
    station = _find_air_quality_station(city, station_name)
    if not station:
        return Response({"error": "station not found."}, status=404)

    asos_station = _nearest_asos_station(station.lat, station.lng)
    cache_key = f"kma_asos_daily_v1_{asos_station['id']}_{start_date:%Y%m%d}_{end_date:%Y%m%d}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    params = {
        "serviceKey": KMA_API_KEY,
        "pageNo": "1",
        "numOfRows": "300",
        "dataType": "JSON",
        "dataCd": "ASOS",
        "dateCd": "DAY",
        "startDt": start_date.strftime("%Y%m%d"),
        "endDt": end_date.strftime("%Y%m%d"),
        "stnIds": asos_station["id"],
    }
    try:
        response = requests.get(KMA_ASOS_DAILY_URL, params=params, headers=AIRKOREA_HEADERS, timeout=20)
        if response.status_code >= 400:
            return Response({
                "error": f"KMA ASOS daily API {response.status_code}",
                "message": response.text[:300],
            }, status=502)
        data = response.json()
    except Exception as exc:
        return Response({"error": f"KMA ASOS daily API failed: {exc}"}, status=502)

    header = data.get("response", {}).get("header", {})
    if response.status_code >= 400 or header.get("resultCode") not in (None, "00"):
        return Response({
            "error": header.get("resultMsg") or f"KMA ASOS daily API {response.status_code}",
            "resultCode": header.get("resultCode"),
        }, status=502)

    items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
    if isinstance(items, dict):
        items = [items]
    result = {
        "city": city,
        "region": district,
        "stationName": station.name,
        "asosStation": asos_station,
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "items": [_serialize_asos_daily_item(item) for item in items],
    }
    cache.set(cache_key, result, 60 * 60 * 6)
    return Response(result)


@api_view(['GET'])
def current_weather(request):
    lat = _to_float(request.GET.get("lat"))
    lng = _to_float(request.GET.get("lng"))
    if lat is None or lng is None:
        return Response({"error": "lat과 lng 파라미터가 필요합니다."}, status=400)

    grid = _dfs_grid_from_lat_lng(lat, lng)
    now = timezone.now()
    measurement = (
        WeatherHourlyMeasurement.objects
        .filter(nx=grid["nx"], ny=grid["ny"], measured_at__lte=now)
        .order_by('-measured_at')
        .first()
    )
    if not measurement:
        measurement = (
            WeatherHourlyMeasurement.objects
            .filter(nx=grid["nx"], ny=grid["ny"])
            .order_by('measured_at')
            .first()
        )
    if not measurement:
        return Response({"error": "저장된 날씨 데이터가 없습니다. collect_realtime_weather를 먼저 실행해 주세요.", "grid": grid}, status=404)
    return Response(_weather_measurement_to_response(measurement))

@api_view(['GET'])
def hourly_weather(request):
    lat = _to_float(request.GET.get("lat"))
    lng = _to_float(request.GET.get("lng"))
    date_param = request.GET.get("date")
    stored_only = str(request.GET.get("stored_only") or "").lower() in ("1", "true", "yes", "y")
    try:
        forecast_hours = int(request.GET.get("forecast_hours") or 12)
    except (TypeError, ValueError):
        forecast_hours = 12
    forecast_hours = max(1, min(forecast_hours, 72))
    if lat is None or lng is None:
        return Response({"error": "lat and lng are required."}, status=400)

    measured_date = _parse_measure_date(date_param) if date_param else timezone.localdate()
    if not measured_date:
        return Response({"error": "date must be YYYYMMDD or YYYY-MM-DD."}, status=400)

    grid = _dfs_grid_from_lat_lng(lat, lng)
    local_tz = timezone.get_current_timezone()
    day_start = timezone.make_aware(datetime.combine(measured_date, time.min), local_tz)
    day_end = day_start + timedelta(days=1)
    now = timezone.now()
    measurements = (
        WeatherHourlyMeasurement.objects
        .filter(nx=grid["nx"], ny=grid["ny"], measured_at__gte=day_start, measured_at__lt=day_end, measured_at__lte=now)
        .order_by('measured_at')
    )
    items = []
    for measurement in measurements:
        measured_at = timezone.localtime(measurement.measured_at)
        items.append({
            "measuredAt": measured_at.isoformat(),
            "date": measured_at.date().isoformat(),
            "hour": measured_at.strftime("%H:00"),
            "temperature": measurement.temperature,
            "humidity": measurement.humidity,
            "wind_speed": measurement.wind_speed,
            "wind_direction": measurement.wind_direction,
            "rain_mm": measurement.rain_mm,
            "rain_probability": measurement.rain_probability,
            "label": measurement.label,
            "sky": measurement.sky,
            "precipitation_type": measurement.precipitation_type,
            "source": "stored_weather_hourly",
            "phase": "stored",
        })
    current_measurement = measurements.last()
    forecast_start = current_measurement.measured_at if current_measurement else now
    forecast_measurements = (
        WeatherHourlyMeasurement.objects
        .filter(nx=grid["nx"], ny=grid["ny"], measured_at__gt=forecast_start)
        .order_by('measured_at')[:forecast_hours]
    )
    forecast_items = []
    if not stored_only:
        for measurement in forecast_measurements:
            measured_at = timezone.localtime(measurement.measured_at)
            forecast_items.append({
                "measuredAt": measured_at.isoformat(),
                "date": measured_at.date().isoformat(),
                "hour": measured_at.strftime("%H:00"),
                "temperature": measurement.temperature,
                "humidity": measurement.humidity,
                "wind_speed": measurement.wind_speed,
                "wind_direction": measurement.wind_direction,
                "rain_mm": measurement.rain_mm,
                "rain_probability": measurement.rain_probability,
                "label": measurement.label,
                "sky": measurement.sky,
                "precipitation_type": measurement.precipitation_type,
                "source": "stored_weather_forecast",
                "phase": "forecast",
            })
    return Response({
        "date": measured_date.isoformat(),
        "grid": grid,
        "items": items,
        "forecastItems": forecast_items,
    })

def _current_station_location(sido, station_name):
    try:
        station_locations, _ = _load_station_locations()
    except Exception:
        return None

    current = station_locations.get(f'{sido}:{station_name}')
    if current:
        return current

    lookup_station = _station_lookup_name(station_name)
    return next((
        location for location in station_locations.values()
        if location.get("sido") == sido and _station_lookup_name(location.get("name")) == lookup_station
    ), None)

def _nearest_station_locations(sido, station_name, limit=3):
    current = _current_station_location(sido, station_name)
    if not current:
        return []

    try:
        station_locations, _ = _load_station_locations()
    except Exception:
        return []

    nearby = []
    for location in station_locations.values():
        if location.get("name") == current.get("name") and location.get("sido") == current.get("sido"):
            continue
        distance = _haversine_km(current["lat"], current["lng"], location["lat"], location["lng"])
        nearby.append({**location, "distance_km": round(distance, 1)})

    nearby.sort(key=lambda item: item["distance_km"])
    return nearby[:limit]

def _rows_from_past_items(items, source):
    return [{
        "ds": item.get("msurDt"),
        "y": item.get("pm10Value"),
        "source": source,
    } for item in items]

def _normalize_prediction_frame(rows):
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df['ds'] = pd.to_datetime(df['ds'], errors='coerce')
    df['y'] = pd.to_numeric(df['y'], errors='coerce')
    df.dropna(inplace=True)
    if df.empty:
        return df

    df['ds'] = df['ds'].dt.normalize()
    df = df.sort_values(['ds', 'source'])
    df = df.drop_duplicates(subset=['ds'], keep='last')
    df = df.sort_values('ds')
    if len(df) >= 20:
        lower = max(1, df['y'].quantile(0.02))
        upper = max(lower, min(300, df['y'].quantile(0.98)))
        df['y'] = df['y'].clip(lower=lower, upper=upper)
    return df

def _blend_with_recent_trend(df, prophet_predictions):
    recent_3 = df.tail(3)['y'].mean()
    recent_7 = df.tail(7)['y'].mean()
    previous_3 = df.tail(6).head(3)['y'].mean() if len(df) >= 6 else recent_7
    short_trend = 0 if pd.isna(previous_3) else (recent_3 - previous_3) * 0.45
    trend_base = recent_3 if not pd.isna(recent_3) else recent_7
    trend_estimates = [
        trend_base + short_trend,
        trend_base + (short_trend * 0.65),
        trend_base + (short_trend * 0.35),
    ]
    blend_weights = [0.72, 0.82, 0.9]
    dynamic_floor = max(1, df['y'].quantile(0.02) * 0.7)
    dynamic_ceiling = max(
        dynamic_floor,
        min(300, max(df['y'].quantile(0.98) * 1.25, df.tail(14)['y'].max() * 1.15))
    )

    predictions = []
    for index, prophet_value in enumerate(prophet_predictions):
        trend_value = trend_estimates[index] if index < len(trend_estimates) else trend_base
        weight = blend_weights[index] if index < len(blend_weights) else 0.9
        blended = (prophet_value * weight) + (trend_value * (1 - weight))
        predictions.append(int(round(max(dynamic_floor, min(dynamic_ceiling, blended)))))
    return predictions

def _baseline_pm10_predictions(df, periods=3):
    y = df['y'].astype(float)
    latest = y.iloc[-1]
    recent_3 = y.tail(3).mean()
    recent_7 = y.tail(7).mean()
    recent_14 = y.tail(14).mean()
    previous_3 = y.tail(6).head(3).mean() if len(y) >= 6 else recent_7
    trend = 0 if pd.isna(previous_3) else max(-10, min(10, (recent_3 - previous_3) * 0.35))
    base = (latest * 0.32) + (recent_3 * 0.28) + (recent_7 * 0.25) + (recent_14 * 0.15)

    predictions = []
    for index in range(periods):
        decay = [1.0, 0.55, 0.25][index] if index < 3 else 0.15
        predictions.append(float(max(1, base + (trend * decay))))
    return predictions

def _adaptive_prophet_weights(backtest=None, volatility_ratio=None):
    if backtest and backtest.get("available"):
        prophet_mae = backtest.get("prophet_mae")
        baseline_mae = backtest.get("baseline_mae")
        if prophet_mae and baseline_mae:
            if baseline_mae * 2.5 < prophet_mae:
                return [0.04, 0.08, 0.12]
            if baseline_mae * 1.5 < prophet_mae:
                return [0.12, 0.18, 0.24]
            if prophet_mae * 1.25 < baseline_mae:
                return [0.55, 0.62, 0.68]

    if volatility_ratio is None:
        return [0.42, 0.5, 0.58]
    if volatility_ratio > 1.25:
        return [0.25, 0.32, 0.4]
    if volatility_ratio < 0.75:
        return [0.5, 0.58, 0.65]
    return [0.42, 0.5, 0.58]

def _ensemble_pm10_predictions(df, prophet_predictions, periods=3, backtest=None):
    baseline = _baseline_pm10_predictions(df, periods=periods)
    y = df['y'].astype(float)
    recent_volatility = y.tail(min(14, len(y))).std()
    history_volatility = y.std()
    if pd.isna(recent_volatility):
        recent_volatility = 0
    if pd.isna(history_volatility) or history_volatility == 0:
        history_volatility = max(1, recent_volatility)

    volatility_ratio = recent_volatility / max(1, history_volatility)
    prophet_weights = _adaptive_prophet_weights(backtest=backtest, volatility_ratio=volatility_ratio)

    blended = []
    for index in range(periods):
        prophet_value = prophet_predictions[index] if index < len(prophet_predictions) else baseline[index]
        prophet_weight = prophet_weights[index] if index < len(prophet_weights) else prophet_weights[-1]
        blended.append((prophet_value * prophet_weight) + (baseline[index] * (1 - prophet_weight)))
    return _blend_with_recent_trend(df, blended), prophet_weights, [round(value, 1) for value in baseline]

def _forecast_pm10(df, periods=3, backtest=None):
    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=True,
        changepoint_prior_scale=0.3,
        seasonality_prior_scale=15,
        changepoint_range=0.95,
    )
    model.fit(df[['ds', 'y']])
    today_date = datetime.now().date()
    latest_data_date = df['ds'].max().date()
    data_lag_days = max(0, (today_date - latest_data_date).days)
    future = model.make_future_dataframe(periods=data_lag_days + periods, freq='D')
    forecast = model.predict(future)
    today = datetime.now().strftime('%Y-%m-%d')
    future_forecast = forecast[forecast['ds'].dt.strftime('%Y-%m-%d') > today].head(periods)
    future_dates = future_forecast['ds'].dt.strftime('%Y-%m-%d').tolist()
    prophet_predictions = future_forecast['yhat'].tolist()
    predictions, prophet_weights, baseline_predictions = _ensemble_pm10_predictions(
        df,
        prophet_predictions,
        periods=periods,
        backtest=backtest,
    )
    return future_dates, predictions, {
        "prophet_predictions": [round(float(value), 1) for value in prophet_predictions],
        "baseline_predictions": baseline_predictions,
        "prophet_weights": prophet_weights,
    }

def _calculate_backtest_metrics(df):
    if len(df) < 45:
        return {
            "available": False,
            "reason": "백테스트를 계산하려면 최소 45일 이상의 데이터가 필요합니다.",
        }

    holdout_days = min(14, max(7, len(df) // 6))
    train_df = df.iloc[:-holdout_days]
    test_df = df.iloc[-holdout_days:].copy()
    if len(train_df) < 30 or test_df.empty:
        return {
            "available": False,
            "reason": "학습/검증 구간을 나누기에 데이터가 부족합니다.",
        }

    try:
        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=True,
            changepoint_prior_scale=0.3,
            seasonality_prior_scale=15,
            changepoint_range=0.95,
        )
        model.fit(train_df[['ds', 'y']])
        future = model.make_future_dataframe(periods=holdout_days, freq='D')
        forecast = model.predict(future)
        predicted = forecast[['ds', 'yhat']].merge(test_df[['ds', 'y']], on='ds', how='inner')
        if predicted.empty:
            return {"available": False, "reason": "검증 날짜와 예측 날짜가 맞지 않습니다."}

        rolling_history = train_df.copy()
        prophet_values = []
        baseline_values = []
        for _, actual_row in test_df.iterrows():
            prophet_row = predicted[predicted['ds'] == actual_row['ds']]
            prophet_value = float(prophet_row.iloc[0]['yhat']) if not prophet_row.empty else float(rolling_history['y'].tail(7).mean())
            prophet_values.append(prophet_value)
            baseline_value = _baseline_pm10_predictions(rolling_history, periods=1)[0]
            baseline_values.append(baseline_value)
            rolling_history = pd.concat([rolling_history, actual_row.to_frame().T], ignore_index=True)

        predicted = predicted.copy()
        predicted['baseline'] = baseline_values[:len(predicted)]
        predicted['prophet_value'] = prophet_values[:len(predicted)]
        prophet_mae = (predicted['yhat'] - predicted['y']).abs().mean()
        baseline_mae = (predicted['baseline'] - predicted['y']).abs().mean()
        prophet_weights = _adaptive_prophet_weights(backtest={
            "available": True,
            "prophet_mae": prophet_mae,
            "baseline_mae": baseline_mae,
        })
        predicted['ensemble'] = [
            (row['prophet_value'] * prophet_weights[min(index, len(prophet_weights) - 1)])
            + (row['baseline'] * (1 - prophet_weights[min(index, len(prophet_weights) - 1)]))
            for index, (_, row) in enumerate(predicted.iterrows())
        ]
        error = (predicted['ensemble'] - predicted['y']).abs()
        rmse = math.sqrt(((predicted['ensemble'] - predicted['y']) ** 2).mean())
        non_zero = predicted[predicted['y'] != 0]
        mape = None
        if not non_zero.empty:
            mape = ((non_zero['ensemble'] - non_zero['y']).abs() / non_zero['y']).mean() * 100

        return {
            "available": True,
            "holdout_days": len(predicted),
            "mae": round(float(error.mean()), 1),
            "rmse": round(float(rmse), 1),
            "mape": round(float(mape), 1) if mape is not None else None,
            "prophet_mae": round(float(prophet_mae), 1),
            "baseline_mae": round(float(baseline_mae), 1),
            "prophet_weights": prophet_weights,
            "method": "rolling_ensemble_backtest",
        }
    except Exception as exc:
        return {
            "available": False,
            "reason": str(exc)[:120],
        }

def _nearby_station_prediction_adjustment(sido, station_name, start_date, end_date):
    nearby_locations = _nearest_station_locations(sido, station_name, limit=3)
    if not nearby_locations:
        return [], [], None

    forecasts = []
    used_stations = []
    first_error = None
    for location in nearby_locations:
        items, error = _fetch_past_dust_items_by_station(location["name"], start_date, end_date)
        if error and not first_error:
            first_error = error
        nearby_df = _normalize_prediction_frame(_rows_from_past_items(items, "nearby"))
        if len(nearby_df) < 30:
            continue
        try:
            _, nearby_predictions, _ = _forecast_pm10(nearby_df, periods=3)
        except Exception as exc:
            if not first_error:
                first_error = str(exc)
            continue
        if len(nearby_predictions) == 3:
            forecasts.append(nearby_predictions)
            used_stations.append({
                "name": location["name"],
                "sido": location["sido"],
                "distance_km": location["distance_km"],
            })

    if not forecasts:
        return [], nearby_locations, first_error

    averaged = []
    for index in range(3):
        averaged.append(sum(forecast[index] for forecast in forecasts) / len(forecasts))
    return averaged, used_stations, first_error

def _kma_base_datetime(now=None):
    now = now or datetime.now()
    available_at = now - timedelta(minutes=75)
    base_times = [2, 5, 8, 11, 14, 17, 20, 23]
    available_hour = available_at.hour
    base_hour = next((hour for hour in reversed(base_times) if hour <= available_hour), None)
    base_date = available_at.date()
    if base_hour is None:
        base_date = base_date - timedelta(days=1)
        base_hour = 23
    return base_date.strftime('%Y%m%d'), f'{base_hour:02d}00'

def _kma_base_datetime_candidates(now=None, limit=4):
    now = now or datetime.now()
    base_times = [2, 5, 8, 11, 14, 17, 20, 23]
    candidates = []
    cursor = now - timedelta(minutes=75)
    while len(candidates) < limit:
        base_hour = next((hour for hour in reversed(base_times) if hour <= cursor.hour), None)
        base_date = cursor.date()
        if base_hour is None:
            base_date = base_date - timedelta(days=1)
            base_hour = 23

        candidate = (base_date.strftime('%Y%m%d'), f'{base_hour:02d}00')
        if candidate not in candidates:
            candidates.append(candidate)
        cursor = datetime.combine(base_date, datetime.min.time()) + timedelta(hours=base_hour) - timedelta(minutes=1)
    return candidates

def _parse_kma_precipitation(value):
    if value in (None, '', '강수없음'):
        return 0.0
    text = str(value).strip()
    if '없음' in text:
        return 0.0
    if '1mm 미만' in text:
        return 0.5
    if '30.0~50.0mm' in text:
        return 40.0
    if '50.0mm 이상' in text:
        return 50.0
    number = ''.join(ch for ch in text if ch.isdigit() or ch == '.')
    return _to_float(number) or 0.0

def _fetch_kma_weather_by_station(sido, station_name):
    return [], "Weather API calls are disabled for request-time reads."

    if not KMA_API_KEY:
        return [], "KMA_API_KEY is not configured."

    location = _current_station_location(sido, station_name)
    if not location:
        return [], "Station location was not found."

    grid = _dfs_grid_from_lat_lng(location["lat"], location["lng"])
    last_error = None
    for base_date, base_time in _kma_base_datetime_candidates():
        cache_key = f'kma_vilage_v2_{grid["nx"]}_{grid["ny"]}_{base_date}_{base_time}'
        cached = cache.get(cache_key)
        if cached is not None:
            if cached:
                return cached, None
            continue

        params = {
            "serviceKey": KMA_API_KEY,
            "pageNo": "1",
            "numOfRows": "1000",
            "dataType": "JSON",
            "base_date": base_date,
            "base_time": base_time,
            "nx": grid["nx"],
            "ny": grid["ny"],
        }
        try:
            response = requests.get(KMA_VILAGE_FORECAST_URL, params=params, headers=AIRKOREA_HEADERS, timeout=15)
            try:
                data = response.json()
            except ValueError:
                preview = response.text.strip()[:240]
                last_error = (
                    f"KMA non-JSON response for base_date={base_date}, base_time={base_time}, "
                    f"nx={grid['nx']}, ny={grid['ny']}, status={response.status_code}: {preview or 'empty body'}"
                )
                cache.set(cache_key, [], 60 * 5)
                continue
            header = data.get("response", {}).get("header", {})
            if response.status_code >= 400 or header.get("resultCode") not in (None, "00"):
                last_error = (
                    f"KMA error for base_date={base_date}, base_time={base_time}, "
                    f"nx={grid['nx']}, ny={grid['ny']}: "
                    f"{header.get('resultCode') or response.status_code} {header.get('resultMsg') or ''}".strip()
                )
                cache.set(cache_key, [], 60 * 5)
                continue
            items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
            if isinstance(items, dict):
                items = [items]
            cache.set(cache_key, items, 60 * 30 if items else 60 * 5)
            if items:
                return items, None
            last_error = f"KMA returned no items for {base_date} {base_time}."
        except Exception as exc:
            last_error = str(exc)

    return [], last_error

def _summarize_kma_weather(items, periods=3):
    daily = {}
    for item in items:
        date = item.get("fcstDate")
        category = item.get("category")
        value = item.get("fcstValue")
        if not date or not category:
            continue

        bucket = daily.setdefault(date, {
            "date": datetime.strptime(date, "%Y%m%d").strftime("%Y-%m-%d"),
            "rain_mm": 0.0,
            "rain_probability": None,
            "wind_speed": None,
            "humidity": None,
            "temperature": None,
            "precipitation_type": 0,
        })
        if category == "PCP":
            bucket["rain_mm"] = max(bucket["rain_mm"], _parse_kma_precipitation(value))
        elif category == "POP":
            pop = _to_float(value)
            bucket["rain_probability"] = max(bucket["rain_probability"] or 0, pop or 0)
        elif category == "WSD":
            wind = _to_float(value)
            bucket["wind_speed"] = max(bucket["wind_speed"] or 0, wind or 0)
        elif category == "REH":
            humidity = _to_float(value)
            bucket["humidity"] = max(bucket["humidity"] or 0, humidity or 0)
        elif category == "TMP":
            temps = bucket.setdefault("_temperatures", [])
            temp = _to_float(value)
            if temp is not None:
                temps.append(temp)
        elif category == "PTY":
            pty = _to_float(value)
            bucket["precipitation_type"] = max(bucket["precipitation_type"], int(pty or 0))

    today = datetime.now().date()
    summaries = []
    for summary in daily.values():
        summary_date = datetime.strptime(summary["date"], "%Y-%m-%d").date()
        if summary_date <= today:
            continue
        temperatures = summary.pop("_temperatures", [])
        if temperatures:
            summary["temperature"] = round(sum(temperatures) / len(temperatures), 1)
        summaries.append(summary)

    summaries.sort(key=lambda item: item["date"])
    return summaries[:periods]

def _weather_adjust_predictions(predictions, weather_days):
    if not weather_days or len(weather_days) != len(predictions):
        return predictions, []

    adjusted = []
    adjustments = []
    for index, prediction in enumerate(predictions):
        weather = weather_days[index]
        factor = 1.0
        reasons = []

        rain_mm = weather.get("rain_mm") or 0
        rain_probability = weather.get("rain_probability") or 0
        precipitation_type = weather.get("precipitation_type") or 0
        wind_speed = weather.get("wind_speed") or 0
        humidity = weather.get("humidity") or 0

        if rain_mm >= 1 or precipitation_type > 0:
            factor -= 0.12
            reasons.append("강수 예보")
        elif rain_probability >= 60:
            factor -= 0.06
            reasons.append("높은 강수확률")

        if wind_speed >= 5:
            factor -= 0.08
            reasons.append("강한 바람")
        elif wind_speed >= 3:
            factor -= 0.04
            reasons.append("보통 이상 바람")

        if humidity >= 85 and rain_mm < 1:
            factor += 0.04
            reasons.append("높은 습도")

        factor = max(0.78, min(1.08, factor))
        adjusted_value = int(round(max(1, prediction * factor)))
        adjusted.append(adjusted_value)
        adjustments.append({
            "date": weather.get("date"),
            "factor": round(factor, 2),
            "before": prediction,
            "after": adjusted_value,
            "reasons": reasons,
        })

    return adjusted, adjustments

@api_view(['GET'])
def predict_dust(request):
    city = request.GET.get('city')
    district = request.GET.get('region')

    if not city or not district:
        return Response({"error": "city와 region 파라미터가 필요합니다."}, status=400)

    cache_key = f'dust_predict_v10_{city}_{district}'
    cached_data = cache.get(cache_key)
    if cached_data:
        return Response(cached_data)

    try:
        # 측정소 이름 매핑
        station_name = _resolve_station_name(city, district)
        print(f"측정소 이름: {station_name}")

        end_date = datetime.now()
        start_date = end_date - timedelta(days=180)  # AirKorea API request limit
        stored_start_date = end_date.date() - timedelta(days=730)

        items = []
        api_error = None

        stored_measurements = DustMeasurement.objects.filter(
            city=city,
            region=district,
            station_name=station_name,
            measured_date__gte=stored_start_date,
            pm10_value__isnull=False,
        ).order_by('measured_date')
        realtime_daily_items = _load_stored_realtime_daily_dust(
            city,
            district,
            station_name,
            stored_start_date,
            end_date,
        )

        api_rows = _rows_from_past_items(items, "airkorea")
        stored_rows = [{
            "ds": measurement.measured_date,
            "y": measurement.pm10_value,
            "source": "stored",
        } for measurement in stored_measurements]
        realtime_rows = _rows_from_past_items(realtime_daily_items, "realtime_daily")

        if len(stored_rows) + len(realtime_rows) < 2:
            items, api_error = _fetch_past_dust_items_by_station(station_name, start_date, end_date, allow_api=True)
            if items:
                _store_past_dust_items(city, district, station_name, items)
            api_rows = _rows_from_past_items(items, "airkorea")

        print(f"가져온 데이터 수: {len(items)}")
        rows = api_rows + stored_rows + realtime_rows
        print(f"저장 일평균 수: {len(stored_rows)}, 실시간 일평균 수: {len(realtime_rows)}")

        if not rows:
            result = {
                city: {
                    district: {
                        "future_dates": [],
                        "predictions": [],
                        "model": {
                            "available": False,
                            "station_name": station_name,
                            "api_count": len(items),
                            "stored_count": 0,
                            "realtime_daily_count": 0,
                            "api_error": api_error,
                            "error": f"{district} 지역에서 예측에 사용할 저장 데이터를 찾을 수 없습니다.",
                        }
                    }
                }
            }
            return Response(result)

        df = _normalize_prediction_frame(rows)

        print(f"학습 데이터 수: {len(df)}")

        if len(df) < 2:
            result = {
                city: {
                    district: {
                        "future_dates": [],
                        "predictions": [],
                        "model": {
                            "available": False,
                            "station_name": station_name,
                            "training_count": len(df),
                            "api_count": len(items),
                            "stored_count": len(stored_rows),
                            "realtime_daily_count": len(realtime_rows),
                            "api_error": api_error,
                            "error": f"{district} 지역에 예측할 만큼의 유효한 데이터가 아직 부족합니다.",
                        }
                    }
                }
            }
            return Response(result)

        backtest = _calculate_backtest_metrics(df)
        future_dates, predictions, ensemble_info = _forecast_pm10(df, periods=3, backtest=backtest)
        nearby_predictions, nearby_stations, nearby_error = _nearby_station_prediction_adjustment(
            city,
            station_name,
            start_date,
            end_date,
        )
        nearby_weights = [0.12, 0.1, 0.08]
        if len(nearby_predictions) == len(predictions):
            predictions = [
                int(round((prediction * (1 - nearby_weights[index])) + (nearby_predictions[index] * nearby_weights[index])))
                for index, prediction in enumerate(predictions)
            ]

        weather_items, weather_error = _fetch_kma_weather_by_station(city, station_name)
        weather_days = _summarize_kma_weather(weather_items, periods=3)
        predictions, weather_adjustments = _weather_adjust_predictions(predictions, weather_days)

        latest_training_date = df['ds'].max().strftime('%Y-%m-%d') if not df.empty else None
        earliest_training_date = df['ds'].min().strftime('%Y-%m-%d') if not df.empty else None

        result = {
            city: {
                district: {
                    "future_dates": future_dates,
                    "predictions": predictions,
                    "model": {
                        "method": "prophet_recent_baseline_nearby_weather_ensemble",
                        "training_count": len(df),
                        "api_count": len(items),
                        "stored_count": len(stored_rows),
                        "realtime_daily_count": len(realtime_rows),
                        "earliest_training_date": earliest_training_date,
                        "latest_training_date": latest_training_date,
                        "api_error": api_error,
                        "nearby_stations": nearby_stations,
                        "nearby_error": nearby_error,
                        "backtest": backtest,
                        "ensemble": ensemble_info,
                        "weather": {
                            "source": "KMA_VilageFcst",
                            "enabled": bool(KMA_API_KEY),
                            "error": weather_error,
                            "days": weather_days,
                            "adjustments": weather_adjustments,
                        },
                    }
                }
            }
        }
        cache.set(cache_key, result, 60 * 60)
        return Response(result)

    except Exception as e:
        print(f"오류 ({city} - {district}): {str(e)}")
        return Response({"error": str(e)}, status=500)

def _build_prediction_for_region(city, district):
    cache_key = f'dust_predict_v10_{city}_{district}'
    cached_data = cache.get(cache_key)
    if cached_data:
        return (cached_data.get(city) or {}).get(district) or {}

    station_name = _resolve_station_name(city, district)
    end_date = datetime.now()
    start_date = end_date - timedelta(days=180)
    stored_start_date = end_date.date() - timedelta(days=730)

    items = []
    api_error = None
    stored_measurements = DustMeasurement.objects.filter(
        city=city,
        region=district,
        station_name=station_name,
        measured_date__gte=stored_start_date,
        pm10_value__isnull=False,
    ).order_by('measured_date')
    realtime_daily_items = _load_stored_realtime_daily_dust(
        city,
        district,
        station_name,
        stored_start_date,
        end_date,
    )

    stored_rows = [{
        "ds": measurement.measured_date,
        "y": measurement.pm10_value,
        "source": "stored",
    } for measurement in stored_measurements]
    realtime_rows = _rows_from_past_items(realtime_daily_items, "realtime_daily")
    api_rows = []

    if len(stored_rows) + len(realtime_rows) < 2:
        items, api_error = _fetch_past_dust_items_by_station(station_name, start_date, end_date, allow_api=True)
        if items:
            _store_past_dust_items(city, district, station_name, items)
        api_rows = _rows_from_past_items(items, "airkorea")

    rows = api_rows + stored_rows + realtime_rows
    if not rows:
        result = {
            "future_dates": [],
            "predictions": [],
            "model": {
                "available": False,
                "station_name": station_name,
                "api_error": api_error,
                "error": f"{district} 지역에서 예측에 사용할 데이터를 찾지 못했습니다.",
            },
        }
    else:
        df = _normalize_prediction_frame(rows)
        if len(df) < 2:
            result = {
                "future_dates": [],
                "predictions": [],
                "model": {
                    "available": False,
                    "station_name": station_name,
                    "training_count": len(df),
                    "api_error": api_error,
                    "error": f"{district} 지역은 아직 예측할 만큼 데이터가 충분하지 않습니다.",
                },
            }
        else:
            backtest = _calculate_backtest_metrics(df)
            future_dates, predictions, ensemble_info = _forecast_pm10(df, periods=3, backtest=backtest)
            nearby_predictions, nearby_stations, nearby_error = _nearby_station_prediction_adjustment(
                city,
                station_name,
                start_date,
                end_date,
            )
            nearby_weights = [0.12, 0.1, 0.08]
            if len(nearby_predictions) == len(predictions):
                predictions = [
                    int(round((prediction * (1 - nearby_weights[index])) + (nearby_predictions[index] * nearby_weights[index])))
                    for index, prediction in enumerate(predictions)
                ]
            weather_items, weather_error = _fetch_kma_weather_by_station(city, station_name)
            weather_days = _summarize_kma_weather(weather_items, periods=3)
            predictions, weather_adjustments = _weather_adjust_predictions(predictions, weather_days)
            result = {
                "future_dates": future_dates,
                "predictions": predictions,
                "model": {
                    "method": "prophet_recent_baseline_nearby_weather_ensemble",
                    "training_count": len(df),
                    "api_count": len(items),
                    "stored_count": len(stored_rows),
                    "realtime_daily_count": len(realtime_rows),
                    "nearby_stations": nearby_stations,
                    "nearby_error": nearby_error,
                    "backtest": backtest,
                    "ensemble": ensemble_info,
                    "weather": {
                        "source": "KMA_VilageFcst",
                        "enabled": bool(KMA_API_KEY),
                        "error": weather_error,
                        "days": weather_days,
                        "adjustments": weather_adjustments,
                    },
                },
            }

    cache.set(cache_key, {city: {district: result}}, 60 * 60)
    return result

def _dust_status(value):
    value = _to_float(value)
    if value is None:
        return "정보 없음"
    if value <= 30:
        return "좋음"
    if value <= 80:
        return "보통"
    if value <= 150:
        return "나쁨"
    return "매우 나쁨"

def _trend_sentence(values):
    if len(values) < 2:
        return "최근 흐름은 판단할 데이터가 아직 부족합니다."
    delta = values[-1] - values[0]
    if abs(delta) < 5:
        return "최근 흐름은 큰 변동 없이 안정적인 편입니다."
    if delta > 0:
        return "최근 흐름은 완만하게 높아지는 쪽입니다."
    return "최근 흐름은 낮아지는 쪽입니다."

def _safe_round(value, digits=1):
    value = _to_float(value)
    return round(value, digits) if value is not None else None

def _extract_data_date_text(value):
    match = re.search(r'(20\d{2})[-./]?(\d{2})[-./]?(\d{2})', str(value or ''))
    if not match:
        return None
    return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

def _is_daily_fallback_current_data(current_data):
    source = current_data.get('source') or ''
    data_time = current_data.get('dataTime') or ''
    return source in {'past_latest', 'past-latest', 'stored_daily_latest'} or '일평균' in data_time

def _extract_chat_date(question):
    today = datetime.now().date()
    if any(word in question for word in ['그제', '그저께']):
        return today - timedelta(days=2), '그제'
    if '어제' in question:
        return today - timedelta(days=1), '어제'
    if '오늘' in question:
        return today, '오늘'

    iso_match = re.search(r'(20\d{2})[-./](\d{1,2})[-./](\d{1,2})', question)
    if iso_match:
        year, month, day = map(int, iso_match.groups())
        try:
            date_value = datetime(year, month, day).date()
            return date_value, date_value.strftime('%Y-%m-%d')
        except ValueError:
            return None, None

    korean_match = re.search(r'(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일', question)
    if korean_match:
        year_text, month, day = korean_match.groups()
        year = int(year_text) if year_text else today.year
        try:
            date_value = datetime(year, int(month), int(day)).date()
            return date_value, f'{date_value.month}월 {date_value.day}일'
        except ValueError:
            return None, None

    return None, None

def _extract_forecast_day_index(question):
    if any(word in question for word in ['모레', '내일모레']):
        return 1, '모레'
    if any(word in question for word in ['글피']):
        return 2, '글피'
    if any(word in question for word in ['내일']):
        return 0, '내일'
    match = re.search(r'(\d)\s*일\s*(?:뒤|후)', question)
    if match:
        index = max(0, min(int(match.group(1)) - 1, 2))
        return index, f"{index + 1}일 뒤"
    return 0, '내일'

def _extract_recent_days(question):
    match = re.search(r'최근\s*(\d{1,2})일', question)
    if not match:
        return None
    days = int(match.group(1))
    return max(2, min(days, 30))

def _measurement_summary(measurement):
    if not measurement:
        return None
    values = [
        f"PM10 {_safe_round(measurement.pm10_value, 0)} µg/m³",
    ]
    if measurement.pm25_value is not None:
        values.append(f"PM2.5 {_safe_round(measurement.pm25_value, 0)} µg/m³")
    if measurement.o3_value is not None:
        values.append(f"O3 {_safe_round(measurement.o3_value, 3)} ppm")
    if measurement.no2_value is not None:
        values.append(f"NO2 {_safe_round(measurement.no2_value, 3)} ppm")
    return ', '.join(values)

def _chat_has_sensitive_hint(question):
    sensitive_keywords = [
        '천식', '질병', '임산부', '임신', '아이', '아기', '노인', '환자',
        '병원', '약', '폐', '심장', '알레르기', '비염',
    ]
    return any(keyword in question for keyword in sensitive_keywords)

def _classify_chat_intent(question, quick_type):
    text = f"{question} {quick_type}".lower()
    app_keywords = ['사용법', '기능', '앱', '사이트', '메뉴', '지도', '상세', '그래프', 'csv', '다운로드', '지역', '즐겨찾기', '알림', '챗봇', '홈', '계정']
    weather_keywords = ['날씨', '기온', '온도', '습도', '풍속', '풍향', '바람', '강수', '강수량', '비', '눈', '맑음', '흐림']
    dust_keywords = ['미세먼지', '초미세먼지', 'pm10', 'pm2.5', 'pm25', '오존', 'o3', '이산화질소', 'no2', '공기', '대기', '먼지', '예측', '측정', '측정소'] + weather_keywords
    if any(keyword in text for keyword in ['안녕', '하이', 'hello', 'hi']):
        return 'greeting'
    if any(keyword in text for keyword in app_keywords):
        return 'site_help'
    if not quick_type and not any(keyword in text for keyword in dust_keywords):
        return 'unknown'
    if quick_type == 'accuracy' or any(keyword in text for keyword in ['정확', '오차', '신뢰']):
        return 'accuracy'
    if _extract_recent_days(question):
        return 'recent_average'
    if _extract_chat_date(question)[0]:
        return 'date_lookup'
    if quick_type == 'basis' or any(keyword in text for keyword in ['왜', '근거', '이유']):
        return 'basis'
    if quick_type == 'period_compare' or any(keyword in text for keyword in ['지난주', '저번주', '평균', '비교', '최근보다', '좋아졌', '나빠졌']):
        return 'period_compare'
    if quick_type == 'tomorrow' or any(keyword in text for keyword in ['내일', '모레', '글피', '예측', '미래']):
        return 'forecast'
    has_dust_keyword = any(keyword in text for keyword in ['공기', '미세먼지', '초미세먼지', '대기', '먼지', 'pm10', 'pm2.5', 'pm25'])
    if quick_type == 'weather' or (not quick_type and any(keyword in text for keyword in weather_keywords) and not has_dust_keyword):
        return 'weather_current'
    if quick_type == 'today' or any(keyword in text for keyword in ['오늘', '현재', '공기', '상태', '날씨', '미세먼지', '대기', '어때']):
        return 'current_status'
    return 'unknown'

def _site_help_answer(question):
    if any(keyword in question for keyword in ['지도', '마커', '전국']):
        return "지도에서는 전국 측정소의 PM10 값을 한눈에 볼 수 있어요. 마커를 누르면 아래에 지역 정보가 뜨고, 지역 이름을 누르거나 마커를 두 번 누르면 상세 데이터로 바로 이동합니다. 자주 보는 지역은 별표로 저장해둘 수 있어요."
    if any(keyword in question for keyword in ['상세', '그래프', 'csv', '다운로드']):
        return "상세 데이터에서는 선택한 지역의 PM10, PM2.5, O3, NO2 흐름을 기간별 그래프로 볼 수 있어요. 날짜를 누르면 그날 값이 강조되고, 필요하면 CSV 파일로 내려받을 수도 있습니다."
    if any(keyword in question for keyword in ['지역', '변경', '설정', '즐겨찾기']):
        return "앱은 처음에 GPS로 현재 지역을 잡아요. 자주 보는 지역은 홈이나 지도에서 즐겨찾기로 저장할 수 있고, 홈 상단 지역명을 눌러 빠르게 바꿔볼 수 있습니다. 저장한 지역은 설정 탭에서 정리할 수 있어요."
    if any(keyword in question for keyword in ['알림']):
        return "알림은 미세먼지가 나쁨 이상으로 올라갈 때 알려주는 기능이에요. Expo Go에서는 테스트가 제한돼서 개발 빌드에서 확인해야 하고, 설정 탭에서 켜고 끌 수 있습니다."
    if any(keyword in question for keyword in ['챗봇', '채팅', '질문']):
        return "챗봇에서는 오늘 공기와 날씨, 내일 미세먼지 예측, 예측 근거, 최근 평균 비교를 물어볼 수 있어요. 앱 사용법이 헷갈릴 때도 '지도는 어떻게 봐?'처럼 물어보면 간단히 안내해드릴게요."
    if any(keyword in question for keyword in ['예측', '정확', '모델']):
        return "예측은 저장된 PM10 기록, 최근 흐름, 가까운 측정소 흐름, 날씨 예보를 함께 보고 계산해요. 정확도는 최근 검증 평균 오차가 있을 때 같이 참고하면 됩니다."
    return "이 앱은 홈에서 현재 공기와 3일 예측을 보고, 지도에서 전국 측정소를 확인하고, 상세 데이터에서 기간별 그래프를 보는 구조예요. 자주 보는 지역은 즐겨찾기에 저장해두면 홈에서 빠르게 바꿔볼 수 있습니다."

def _chat_unknown_answer():
    return (
        "그건 제가 정확히 답하기 어려워요. 저는 이 앱의 대기질과 날씨 데이터, 미세먼지 예측, 지도/상세 데이터/즐겨찾기/알림 같은 기능을 도와주는 챗봇입니다. "
        "예를 들면 '오늘 공기랑 날씨 어때?', '내일 미세먼지 예측은?', '지도는 어떻게 봐?'처럼 물어봐 주세요."
    )

def _load_chat_address_regions():
    cache_key = 'chat_address_regions_v1'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'addr.json')
    try:
        with open(path, 'r', encoding='utf-8') as file:
            data = json.load(file)
    except Exception:
        data = {}

    cache.set(cache_key, data, 60 * 60 * 24)
    return data

def _compact_korean_text(value):
    return re.sub(r'\s+', '', value or '')

def _add_region_candidate(candidates, city, region, reason, station_name=None):
    if not city or not region:
        return
    key = f'{city}:{region}'
    if key in candidates:
        return
    candidates[key] = {
        "city": city,
        "region": region,
        "station_name": station_name or _resolve_station_name(city, region),
        "reason": reason,
    }

def _match_chat_region_candidates(question, fallback_city, fallback_region):
    compact_question = _compact_korean_text(question)
    candidates = {}
    address_regions = _load_chat_address_regions()

    exact_candidates = {}
    for city, regions in address_regions.items():
        city_in_question = city in compact_question
        for region in regions:
            if city_in_question and region in compact_question:
                _add_region_candidate(exact_candidates, city, region, "시/도와 시/군/구가 질문에 함께 포함됨")
            elif len(region) >= 3 and region in compact_question:
                _add_region_candidate(candidates, city, region, "시/군/구 이름이 질문에 포함됨")

    if exact_candidates:
        return list(exact_candidates.values()), None

    for city, mapping in STATION_MAPPING.items():
        city_in_question = city in compact_question
        for region, station_name in mapping.items():
            if station_name and station_name in compact_question:
                _add_region_candidate(candidates, city, region, "측정소 이름이 질문에 포함됨", station_name)
            elif city_in_question and region in compact_question:
                _add_region_candidate(exact_candidates, city, region, "지역 이름이 질문에 포함됨", station_name)

    if exact_candidates:
        return list(exact_candidates.values()), None

    if len(candidates) <= 1:
        try:
            station_locations, _ = _load_station_locations()
        except Exception:
            station_locations = {}

        for location in station_locations.values():
            location_name = _compact_korean_text(location.get('name'))
            location_addr = _compact_korean_text(location.get('addr'))
            if not location_name and not location_addr:
                continue
            if location_name not in compact_question and not any(part and part in compact_question for part in re.findall(r'[가-힣]+동|[가-힣]+읍|[가-힣]+면', location_addr)):
                if location_addr and location_addr not in compact_question:
                    continue

            city = location.get('sido')
            region = None
            for candidate_region in STATION_MAPPING.get(city, {}).keys():
                if candidate_region in location_addr:
                    region = candidate_region
                    break
            region = region or location.get('name')
            _add_region_candidate(candidates, city, region, "측정소 주소에서 가까운 지역을 찾음", location.get('name'))
            if len(candidates) >= 4:
                break

    if not candidates and fallback_city and fallback_region:
        return [], {"city": fallback_city, "region": fallback_region, "station_name": _resolve_station_name(fallback_city, fallback_region)}

    return list(candidates.values()), None

def _save_chat_log(request, city, district, intent, answer_type, analysis, question):
    try:
        user_label = ''
        if getattr(request, 'user', None) and request.user.is_authenticated:
            user_label = f'user:{request.user.pk}'
        DustChatLog.objects.create(
            session_key=request.session.session_key or '',
            user_label=user_label,
            city=city,
            region=district,
            intent=intent,
            question_type=intent,
            answer_type=answer_type,
            contains_sensitive_hint=_chat_has_sensitive_hint(question),
            used_data=analysis,
        )
    except Exception:
        pass

def _weather_chat_value(weather_data, camel_key, snake_key=None):
    if not isinstance(weather_data, dict):
        return None
    value = weather_data.get(camel_key)
    if value is None and snake_key:
        value = weather_data.get(snake_key)
    return _to_float(value)

def _weather_chat_label(weather_data):
    if not isinstance(weather_data, dict):
        return ''
    return weather_data.get('label') or weather_data.get('weatherLabel') or ''

def _weather_chat_time(weather_data):
    if not isinstance(weather_data, dict):
        return ''
    value = weather_data.get('measured_at') or weather_data.get('measuredAt') or weather_data.get('weatherTime')
    if not value:
        return ''
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text.replace('Z', '+00:00'))
        return parsed.strftime('%Y-%m-%d %H:%M')
    except ValueError:
        return text.replace('T', ' ')[:16]

def _wind_direction_label(degrees):
    if degrees is None:
        return ''
    directions = ['북', '북동', '동', '남동', '남', '남서', '서', '북서']
    index = int((float(degrees) + 22.5) // 45) % 8
    return directions[index]

def _format_chat_weather_number(value, decimals=0):
    if value is None:
        return ''
    formatted = f"{float(value):.{decimals}f}"
    if '.' in formatted:
        formatted = formatted.rstrip('0').rstrip('.')
    return formatted

def _weather_chat_summary(weather_data):
    temperature = _weather_chat_value(weather_data, 'temperature')
    humidity = _weather_chat_value(weather_data, 'humidity')
    wind_speed = _weather_chat_value(weather_data, 'windSpeed', 'wind_speed')
    wind_direction = _weather_chat_value(weather_data, 'windDirection', 'wind_direction')
    rain_mm = _weather_chat_value(weather_data, 'rainMm', 'rain_mm')
    label = _weather_chat_label(weather_data)
    measured_at = _weather_chat_time(weather_data)

    if temperature is None and humidity is None and wind_speed is None and rain_mm is None:
        return None

    parts = []
    if temperature is not None:
        parts.append(f"기온 {_format_chat_weather_number(temperature)}°C")
    if label:
        parts.append(label)
    if humidity is not None:
        parts.append(f"습도 {_format_chat_weather_number(humidity)}%")
    if wind_speed is not None:
        direction_label = _wind_direction_label(wind_direction)
        wind_text = f"풍속 {_format_chat_weather_number(wind_speed, 1)} m/s"
        if direction_label:
            wind_text += f"({direction_label}풍)"
        parts.append(wind_text)
    if rain_mm is not None:
        parts.append(f"강수량 {_format_chat_weather_number(rain_mm, 1)} mm")

    return {
        "parts": parts,
        "label": label,
        "measured_at": measured_at,
        "temperature": temperature,
        "humidity": humidity,
        "wind_speed": wind_speed,
        "wind_direction": wind_direction,
        "rain_mm": rain_mm,
    }

def _weather_chat_sentence(weather_data):
    summary = _weather_chat_summary(weather_data)
    if not summary:
        return ''
    time_text = f"{summary['measured_at']} 기준 " if summary.get('measured_at') else ''
    return f"{time_text}날씨는 {', '.join(summary['parts'])}입니다."

@api_view(['POST'])
def dust_chat(request):
    city = request.data.get('city') or '서울'
    district = request.data.get('region') or '송파구'
    question = (request.data.get('question') or '').strip()
    quick_type = request.data.get('quickType') or ''
    current_data = request.data.get('currentData') or {}
    prediction = request.data.get('prediction') or {}
    weather_data = request.data.get('weather') or {}
    text = f"{question} {quick_type}".lower()
    intent = _classify_chat_intent(question, quick_type)

    if intent in ['greeting', 'unknown', 'site_help']:
        if intent == 'greeting':
            answer = "안녕하세요. 오늘 공기 상태, 현재 날씨, 내일 미세먼지 예측이 궁금하면 바로 물어보세요. 앱 사용법도 같이 안내해드릴게요."
            answer_type = "greeting"
        elif intent == 'site_help':
            answer = _site_help_answer(question)
            answer_type = "site_help"
        else:
            answer = _chat_unknown_answer()
            answer_type = "out_of_scope"
        analysis = {
            "city": city,
            "region": district,
            "intent": intent,
        }
        _save_chat_log(request, city, district, intent, answer_type, analysis, question)
        return Response({"answer": answer, "intent": intent, "analysis": analysis})

    matched_regions, fallback_region = _match_chat_region_candidates(question, city, district)
    if len(matched_regions) > 1:
        options = ', '.join([f"{item['city']} {item['region']}" for item in matched_regions[:4]])
        answer = f"질문에 나온 지역이 여러 곳일 수 있습니다. {options} 중 어느 지역을 말하는지 시/도와 구/군까지 함께 적어주세요."
        analysis = {
            "city": city,
            "region": district,
            "intent": "region_disambiguation",
            "matched_regions": matched_regions[:4],
        }
        _save_chat_log(request, city, district, "region_disambiguation", "clarification", analysis, question)
        return Response({"answer": answer, "intent": "region_disambiguation", "analysis": analysis})

    if len(matched_regions) == 1:
        matched = matched_regions[0]
        original_city, original_district = city, district
        city = matched["city"]
        district = matched["region"]
        if city != original_city or district != original_district:
            current_data = {}
            prediction = {}
            weather_data = {}
    elif fallback_region:
        city = fallback_region["city"]
        district = fallback_region["region"]

    station_name = _resolve_station_name(city, district)
    if not current_data:
        try:
            realtime_values, _ = _load_realtime_station_values(with_debug=False)
            current = _find_current_realtime_value(city, district, station_name, realtime_values)
            if current and _has_usable_realtime_values(current):
                current_data = _station_realtime_to_current_item(current, city, district, station_name, "realtime_current")
        except Exception:
            current_data = {}
    if intent in ['forecast', 'basis', 'accuracy'] and not prediction.get('predictions'):
        try:
            prediction = _build_prediction_for_region(city, district)
        except Exception:
            prediction = {}
    measurements = DustMeasurement.objects.filter(
        city=city,
        region=district,
        station_name=station_name,
        pm10_value__isnull=False,
    ).order_by('measured_date')
    if not measurements.exists():
        end_date = datetime.now()
        start_date = end_date - timedelta(days=180)
        items, _ = _fetch_past_dust_items_by_station(station_name, start_date, end_date)
        if items:
            _store_past_dust_items(city, district, station_name, items)
            measurements = DustMeasurement.objects.filter(
                city=city,
                region=district,
                station_name=station_name,
                pm10_value__isnull=False,
            ).order_by('measured_date')

    recent_values = [m.pm10_value for m in measurements[max(0, measurements.count() - 14):]]
    recent_4_values = recent_values[-4:]
    recent_7 = sum(recent_values[-7:]) / len(recent_values[-7:]) if recent_values[-7:] else None
    previous_7_slice = recent_values[-14:-7]
    previous_7 = sum(previous_7_slice) / len(previous_7_slice) if previous_7_slice else None
    latest_measurement = measurements.last()
    realtime_pm10 = _to_float(current_data.get('pm10Value'))
    current_pm10 = realtime_pm10 or (latest_measurement.pm10_value if latest_measurement else None)
    current_source_label = '가장 가까운 현재 측정값' if realtime_pm10 is not None else '저장된 최신 측정값'
    current_status = _dust_status(current_pm10)
    current_is_daily_fallback = _is_daily_fallback_current_data(current_data)
    latest_available_date = _extract_data_date_text(current_data.get('dataTime'))
    if not latest_available_date and latest_measurement:
        latest_available_date = latest_measurement.measured_date.strftime('%Y-%m-%d')
    latest_available_label = f"{latest_available_date} 일평균" if latest_available_date else "저장된 최신 일평균"

    model = prediction.get('model') or {}
    backtest = model.get('backtest') or {}
    weather = model.get('weather') or {}
    forecast_index, forecast_label = _extract_forecast_day_index(question)
    forecast_values = prediction.get('predictions') or []
    forecast_dates = prediction.get('future_dates') or []
    forecast_value = forecast_values[forecast_index] if forecast_index < len(forecast_values) else None
    forecast_date = forecast_dates[forecast_index] if forecast_index < len(forecast_dates) else forecast_label
    forecast_status = _dust_status(forecast_value)
    tomorrow_value = forecast_values[0] if forecast_values else None
    tomorrow_date = forecast_dates[0] if forecast_dates else '내일'
    tomorrow_status = _dust_status(tomorrow_value)
    weather_adjustments = weather.get('adjustments') or []
    weather_reasons = weather_adjustments[0].get('reasons', []) if weather_adjustments else []
    current_weather_sentence = _weather_chat_sentence(weather_data)
    current_weather_summary = _weather_chat_summary(weather_data)
    nearby_count = len(model.get('nearby_stations') or [])
    basis_parts = ['최근 미세먼지 측정 흐름']
    if nearby_count:
        basis_parts.append(f'가까운 측정소 {nearby_count}곳의 흐름')
    if weather.get('enabled') and not weather.get('error'):
        basis_parts.append('비와 바람 같은 날씨 예보')

    if intent == 'accuracy':
        if backtest.get('available') and backtest.get('mae') is not None:
            answer = f"최근 검증 기준 평균 오차는 약 {backtest.get('mae')} µg/m³예요. 그래서 예측값은 딱 맞는 숫자라기보다 이 정도 오차 범위를 감안해서 보는 게 좋습니다."
        else:
            answer = "아직 정확도 지표를 계산할 만큼 검증 데이터가 충분하지 않아요. 데이터가 더 쌓이면 평균 오차도 같이 보여드릴 수 있습니다."
    elif intent == 'weather_current':
        if current_weather_sentence:
            answer = f"{city} {district}의 {current_weather_sentence} 홈 화면에 저장된 최신 날씨 기준이라 새 API 호출 없이 확인한 값이에요."
        else:
            answer = f"{city} {district}의 저장된 최신 날씨 값을 아직 찾지 못했어요. 홈 화면 날씨가 먼저 정상적으로 불러와지면 기온, 습도, 풍속, 강수량까지 같이 답해드릴 수 있습니다."
    elif intent == 'recent_average':
        days = _extract_recent_days(question)
        selected = list(measurements)[-days:]
        if selected:
            avg_pm10 = sum(m.pm10_value for m in selected if m.pm10_value is not None) / len(selected)
            min_item = min(selected, key=lambda item: item.pm10_value if item.pm10_value is not None else 9999)
            max_item = max(selected, key=lambda item: item.pm10_value if item.pm10_value is not None else -1)
            answer = (
                f"최근 {len(selected)}일 평균은 PM10 기준 약 {avg_pm10:.1f} µg/m³예요. "
                f"제일 낮았던 날은 {min_item.measured_date.strftime('%Y-%m-%d')}({_safe_round(min_item.pm10_value, 0)}), "
                f"제일 높았던 날은 {max_item.measured_date.strftime('%Y-%m-%d')}({_safe_round(max_item.pm10_value, 0)})였습니다."
            )
        else:
            answer = f"최근 {days}일 데이터를 아직 찾지 못했어요. 데이터가 쌓이면 평균과 최고/최저일을 같이 비교해드릴게요."
    elif intent == 'date_lookup':
        target_date, date_label = _extract_chat_date(question)
        measurement = measurements.filter(measured_date=target_date).first()
        if date_label == '오늘' and current_pm10 is not None:
            if current_is_daily_fallback:
                answer = f"오늘 실시간 값은 아직 확인되지 않았어요. 대신 현재 확인 가능한 최신 데이터는 {latest_available_label}이고, {city} {district}의 PM10은 약 {_safe_round(current_pm10, 0)} µg/m³로 {current_status} 범위입니다."
            else:
                answer = f"오늘 {city} {district}의 {current_source_label}은 PM10 약 {_safe_round(current_pm10, 0)} µg/m³예요. 기준으로 보면 {current_status} 범위입니다."
        elif measurement:
            summary = _measurement_summary(measurement)
            status = _dust_status(measurement.pm10_value)
            current_compare = ''
            if current_pm10 is not None and measurement.pm10_value is not None:
                diff = current_pm10 - measurement.pm10_value
                if abs(diff) >= 1:
                    direction = '높습니다' if diff > 0 else '낮습니다'
                    current_compare = f" 현재값과 비교하면 약 {abs(diff):.0f} µg/m³ {direction}."
            answer = f"{date_label} {city} {district} 기록은 {summary}였어요. PM10 기준으로는 {status} 범위였습니다.{current_compare}"
        else:
            nearest = measurements.filter(measured_date__lt=target_date).last()
            if nearest:
                answer = (
                    f"{date_label} 기록은 아직 저장되어 있지 않아요. "
                    f"가장 가까운 이전 기록은 {nearest.measured_date.strftime('%Y-%m-%d')}이고, "
                    f"PM10은 {_safe_round(nearest.pm10_value, 0)} µg/m³였습니다."
                )
            else:
                answer = f"{date_label}의 저장된 측정 기록을 찾지 못했어요."
    elif intent == 'basis':
        reason_text = f" 이번 예측에는 {', '.join(weather_reasons[:2])}도 함께 고려했습니다." if weather_reasons else ""
        answer = (
            f"예측은 {', '.join(basis_parts)}을 함께 보고 계산합니다. "
            f"쉽게 말하면 최근에 먼지가 오르는지 내려가는지 보고, 주변 지역도 비슷한 흐름인지 확인한 뒤 날씨 영향을 더합니다."
            f"{reason_text}"
        )
    elif intent == 'period_compare':
        if recent_7 is not None and previous_7 is not None:
            diff = recent_7 - previous_7
            if diff > 2:
                verdict = '조금 나빠진 편이에요'
                detail = 'PM10 평균이 올라갔습니다'
            elif diff < -2:
                verdict = '좋아진 편이에요'
                detail = 'PM10 평균이 내려갔습니다'
            else:
                verdict = '지난주와 비슷한 편이에요'
                detail = '평균 차이가 크지 않습니다'
            answer = (
                f"최근 7일은 이전 7일과 비교하면 {verdict}. "
                f"최근 평균은 {recent_7:.1f} µg/m³, 이전 7일 평균은 {previous_7:.1f} µg/m³라서 "
                f"{abs(diff):.1f} µg/m³ 차이입니다. {detail}."
            )
        else:
            answer = "최근 비교를 하려면 최소 2주 정도의 저장 데이터가 필요해요. 데이터가 더 쌓이면 최근 7일과 이전 7일을 나눠 비교해드릴게요."
    elif intent == 'forecast':
        if forecast_value is not None:
            adjustment = weather_adjustments[forecast_index] if forecast_index < len(weather_adjustments) else {}
            reasons = adjustment.get('reasons') or weather_reasons
            reason_text = f" {', '.join(reasons[:2])} 영향도 반영됐습니다." if reasons else ""
            answer = f"{forecast_date} {city} {district}의 예상 PM10은 약 {round(float(forecast_value))} µg/m³예요. 기준으로 보면 {forecast_status} 범위입니다.{reason_text}"
        else:
            answer = f"{city} {district}의 {forecast_label} 예측값을 아직 불러오지 못했어요. 잠시 후 다시 확인해 주세요."
    elif intent == 'current_status':
        if current_pm10 is None:
            answer = f"{city} {district}의 저장된 미세먼지 데이터를 아직 찾지 못했어요. 시/도와 구/군을 더 정확히 입력하면 다시 확인할 수 있습니다."
        elif current_is_daily_fallback:
            trend = _trend_sentence(recent_4_values)
            weather_text = f" {current_weather_sentence}" if current_weather_sentence else ""
            answer = f"오늘 실시간 값은 아직 확인되지 않았어요. 현재 확인 가능한 최신 데이터는 {latest_available_label}이고, {city} {district}의 PM10은 약 {_safe_round(current_pm10, 0)} µg/m³로 {current_status} 범위입니다. {trend}{weather_text}"
        else:
            trend = _trend_sentence(recent_4_values)
            weather_text = f" {current_weather_sentence}" if current_weather_sentence else ""
            answer = f"{city} {district}의 {current_source_label}은 PM10 약 {_safe_round(current_pm10, 0)} µg/m³예요. 기준으로는 {current_status} 범위입니다. {trend}{weather_text}"
    else:
        answer = _chat_unknown_answer()

    analysis = {
        "city": city,
        "region": district,
        "station_name": station_name,
        "stored_days": measurements.count(),
        "current_pm10": _safe_round(current_pm10, 1),
        "current_status": current_status,
        "recent_7_avg": _safe_round(recent_7, 1),
        "previous_7_avg": _safe_round(previous_7, 1),
        "forecast_pm10": prediction.get('predictions') or [],
        "forecast_dates": prediction.get('future_dates') or [],
        "basis": basis_parts,
        "backtest_mae": backtest.get('mae'),
        "weather_reasons": weather_reasons,
        "current_weather": current_weather_summary,
    }
    answer_type = 'weather_analysis' if intent == 'weather_current' else ('site_help' if intent == 'site_help' else 'dust_analysis')
    _save_chat_log(request, city, district, intent, answer_type, analysis, question)

    return Response({
        "answer": answer,
        "intent": intent,
        "analysis": analysis,
    })

def _to_float(value):
    try:
        if value in (None, '', '-'):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None

def _parse_measure_date(value):
    if not value:
        return None
    date_text = str(value).split()[0]
    try:
        return datetime.strptime(date_text, '%Y%m%d').date()
    except ValueError:
        try:
            return datetime.strptime(date_text, '%Y-%m-%d').date()
        except ValueError:
            return None

def _serialize_stored_measurement(measurement):
    date_text = measurement.measured_date.strftime('%Y%m%d')
    raw = measurement.raw_data or {}
    return {
        **raw,
        "msurDt": raw.get("msurDt") or date_text,
        "pm10Value": raw.get("pm10Value") if raw.get("pm10Value") not in (None, '') else measurement.pm10_value,
        "pm25Value": raw.get("pm25Value") if raw.get("pm25Value") not in (None, '') else measurement.pm25_value,
        "o3Value": raw.get("o3Value") if raw.get("o3Value") not in (None, '') else measurement.o3_value,
        "no2Value": raw.get("no2Value") if raw.get("no2Value") not in (None, '') else measurement.no2_value,
        "stationName": raw.get("stationName") or measurement.station_name,
        "source": "stored",
    }

def _store_past_dust_items(city, district, station_name, items):
    saved = 0
    for item in items:
        measured_date = _parse_measure_date(item.get('msurDt'))
        if not measured_date:
            continue
        DustMeasurement.objects.update_or_create(
            city=city,
            region=district,
            station_name=station_name,
            measured_date=measured_date,
            defaults={
                "pm10_value": _to_float(item.get('pm10Value')),
                "pm25_value": _to_float(item.get('pm25Value')),
                "o3_value": _to_float(item.get('o3Value')),
                "no2_value": _to_float(item.get('no2Value')),
                "raw_data": item,
            },
        )
        saved += 1
    return saved

def _load_stored_past_dust(city, district, station_name, start_date, end_date):
    start = _parse_measure_date(start_date)
    end = _parse_measure_date(end_date)
    if not start or not end:
        return []
    measurements = DustMeasurement.objects.filter(
        city=city,
        region=district,
        station_name=station_name,
        measured_date__gte=start,
        measured_date__lte=end,
    ).order_by('measured_date')
    return [_serialize_stored_measurement(measurement) for measurement in measurements]

def _average_measurement_values(measurements):
    totals = {"pm10Value": 0, "pm25Value": 0, "o3Value": 0, "no2Value": 0}
    counts = {"pm10Value": 0, "pm25Value": 0, "o3Value": 0, "no2Value": 0}
    field_map = {
        "pm10Value": "pm10_value",
        "pm25Value": "pm25_value",
        "o3Value": "o3_value",
        "no2Value": "no2_value",
    }

    for measurement in measurements:
        for output_key, field_name in field_map.items():
            value = getattr(measurement, field_name)
            if value is None:
                continue
            totals[output_key] += value
            counts[output_key] += 1

    return {
        key: round(totals[key] / counts[key], 3 if key in {"o3Value", "no2Value"} else 1)
        for key in totals
        if counts[key]
    }

def _load_stored_realtime_daily_dust(city, district, station_name, start_date, end_date):
    start = _parse_measure_date(start_date)
    end = _parse_measure_date(end_date)
    if not start or not end:
        return []

    station = _find_air_quality_station(city, station_name)
    if not station:
        return []

    measurements = (
        RealtimeDustMeasurement.objects
        .filter(
            station=station,
            measured_at__date__gte=start,
            measured_at__date__lte=end,
        )
        .order_by('measured_at')
    )
    grouped = {}
    for measurement in measurements:
        measured_date = timezone.localtime(measurement.measured_at).date()
        grouped.setdefault(measured_date, []).append(measurement)

    items = []
    for measured_date in sorted(grouped):
        averages = _average_measurement_values(grouped[measured_date])
        if averages.get("pm10Value") is None:
            continue
        items.append({
            "msurDt": measured_date.isoformat(),
            "pm10Value": averages.get("pm10Value"),
            "pm25Value": averages.get("pm25Value"),
            "o3Value": averages.get("o3Value"),
            "no2Value": averages.get("no2Value"),
            "msrstnName": station.name,
            "stationName": station.name,
            "city": city,
            "region": district,
            "source": "stored_realtime_daily",
            "sampleCount": len(grouped[measured_date]),
        })
    return items

def _serialize_realtime_hourly_measurement(measurement, city, district, station):
    measured_at = timezone.localtime(measurement.measured_at)
    return {
        "measuredAt": measured_at.isoformat(),
        "date": measured_at.date().isoformat(),
        "hour": measured_at.strftime('%H:00'),
        "pm10Value": measurement.pm10_value,
        "pm25Value": measurement.pm25_value,
        "o3Value": measurement.o3_value,
        "no2Value": measurement.no2_value,
        "msrstnName": station.name,
        "stationName": station.name,
        "city": city,
        "region": district,
        "source": "stored_realtime_hourly",
    }

def _load_stored_realtime_hourly_dust(city, district, station_name, measured_date, station=None):
    station = station or _find_air_quality_station(city, station_name)
    if not station:
        return []

    measurements = (
        RealtimeDustMeasurement.objects
        .filter(station=station, measured_at__date=measured_date)
        .order_by('measured_at')
    )
    return [_serialize_realtime_hourly_measurement(measurement, city, district, station) for measurement in measurements]

def _load_recent_realtime_hourly_dust(city, district, station_name, hours=24, station=None):
    station = station or _find_air_quality_station(city, station_name)
    if not station:
        return []
    cutoff = timezone.now() - timedelta(hours=hours)
    measurements = (
        RealtimeDustMeasurement.objects
        .filter(station=station, measured_at__gte=cutoff)
        .order_by('measured_at')
    )
    return [_serialize_realtime_hourly_measurement(measurement, city, district, station) for measurement in measurements]

def _weather_factor_for_pm10(weather):
    if not weather:
        return 0

    rain_mm = _to_float(weather.get("rain_mm")) or 0
    rain_probability = _to_float(weather.get("rain_probability")) or 0
    wind_speed = _to_float(weather.get("wind_speed"))
    humidity = _to_float(weather.get("humidity"))
    precipitation_type = str(weather.get("precipitation_type") or "")

    factor = 0
    if rain_mm >= 5 or rain_probability >= 70 or precipitation_type not in ("", "0"):
        factor -= 8
    elif rain_mm > 0 or rain_probability >= 40:
        factor -= 4

    if wind_speed is not None:
        if wind_speed >= 5:
            factor -= 5
        elif wind_speed <= 1.2:
            factor += 4

    if humidity is not None:
        if humidity >= 85:
            factor += 3
        elif humidity <= 35:
            factor -= 2

    return max(-12, min(8, factor))

def _build_hourly_dust_forecast(items, weather_forecasts=None, hours=12, station=None, city="", district=""):
    usable = [item for item in items if _to_float(item.get("pm10Value")) is not None]
    if not usable:
        return []

    ml_forecast_items = build_ml_hourly_pm10_forecast(station, city, district, usable, weather_forecasts, hours=hours)
    if ml_forecast_items:
        return ml_forecast_items

    latest = usable[-1]
    latest_pm10 = _to_float(latest.get("pm10Value"))
    latest_pm25 = _to_float(latest.get("pm25Value"))
    latest_o3 = _to_float(latest.get("o3Value"))
    latest_no2 = _to_float(latest.get("no2Value"))
    latest_time = _parse_airkorea_datetime(latest.get("measuredAt")) or timezone.now()
    recent_pm10_values = [_to_float(item.get("pm10Value")) for item in usable[-6:]]
    recent_pm10_values = [value for value in recent_pm10_values if value is not None]
    short_values = recent_pm10_values[-3:] or recent_pm10_values
    short_avg = sum(short_values) / len(short_values) if short_values else latest_pm10 or 0
    long_avg = sum(recent_pm10_values) / len(recent_pm10_values) if recent_pm10_values else short_avg
    previous_pm10 = recent_pm10_values[-2] if len(recent_pm10_values) >= 2 else latest_pm10
    last_step_trend = 0 if previous_pm10 is None or latest_pm10 is None else latest_pm10 - previous_pm10
    window_trend = 0
    if len(recent_pm10_values) >= 4:
        earlier = recent_pm10_values[:len(recent_pm10_values) // 2]
        later = recent_pm10_values[len(recent_pm10_values) // 2:]
        window_trend = (sum(later) / len(later)) - (sum(earlier) / len(earlier))
    trend = max(-6, min(6, (last_step_trend * 0.55) + (window_trend * 0.45)))
    baseline = ((latest_pm10 or short_avg) * 0.62) + (short_avg * 0.25) + (long_avg * 0.13)

    forecast_items = []
    weather_forecasts = weather_forecasts or []
    weather_by_time = {f"{forecast.get('date')} {forecast.get('hour')}": forecast for forecast in weather_forecasts}
    for step in range(1, hours + 1):
        measured_at = timezone.localtime(latest_time + timedelta(hours=step))
        damping = max(0.15, 1 - (step * 0.07))
        weather_key = f"{measured_at.date().isoformat()} {measured_at.strftime('%H:00')}"
        weather_factor = _weather_factor_for_pm10(weather_by_time.get(weather_key))
        mean_reversion = (long_avg - baseline) * min(0.35, step * 0.035)
        pm10_value = max(0, baseline + trend * damping + weather_factor + mean_reversion)
        forecast_items.append({
            "measuredAt": measured_at.isoformat(),
            "date": measured_at.date().isoformat(),
            "hour": measured_at.strftime('%H:00'),
            "pm10Value": round(pm10_value, 1),
            "pm25Value": round(latest_pm25, 1) if latest_pm25 is not None else None,
            "o3Value": round(latest_o3, 3) if latest_o3 is not None else None,
            "no2Value": round(latest_no2, 3) if latest_no2 is not None else None,
            "source": "hourly_trend_forecast",
            "phase": "forecast",
            "weatherFactor": round(weather_factor, 1),
            "trend": round(trend, 1),
            "horizonHours": step,
            "baseline": round(baseline, 1),
            "modelName": "hourly_trend_weather_v1",
        })
    return forecast_items

def _store_hourly_dust_predictions(station, city, district, forecast_items):
    if not station or not forecast_items:
        return 0

    predicted_at = timezone.now().replace(minute=0, second=0, microsecond=0)
    saved = 0
    for item in forecast_items:
        pm10_predicted = _to_float(item.get("pm10Value"))
        target_at = _parse_airkorea_datetime(item.get("measuredAt"))
        if pm10_predicted is None or not target_at:
            continue

        HourlyDustPrediction.objects.update_or_create(
            station=station,
            target_at=target_at,
            predicted_at=predicted_at,
            model_name=item.get("modelName") or "hourly_trend_weather_v1",
            defaults={
                "city": city,
                "region": district,
                "horizon_hours": int(item.get("horizonHours") or 0),
                "pm10_predicted": pm10_predicted,
                "weather_factor": _to_float(item.get("weatherFactor")) or 0,
                "trend": _to_float(item.get("trend")) or 0,
                "raw_data": item,
            },
        )
        saved += 1
    return saved

def _serialize_hourly_dust_prediction(prediction):
    target_at = timezone.localtime(prediction.target_at)
    raw_data = prediction.raw_data or {}
    return {
        "measuredAt": target_at.isoformat(),
        "date": target_at.date().isoformat(),
        "hour": target_at.strftime('%H:00'),
        "pm10Value": round(prediction.pm10_predicted, 1),
        "pm25Value": raw_data.get("pm25Value"),
        "o3Value": raw_data.get("o3Value"),
        "no2Value": raw_data.get("no2Value"),
        "source": "stored_hourly_prediction",
        "phase": "forecast",
        "weatherFactor": round(prediction.weather_factor, 1),
        "trend": round(prediction.trend, 1),
        "horizonHours": prediction.horizon_hours,
        "baseline": raw_data.get("baseline"),
        "predictedAt": timezone.localtime(prediction.predicted_at).isoformat(),
        "modelName": prediction.model_name,
    }

def _load_stored_hourly_dust_predictions(station, measured_date, limit=12):
    if not station:
        return []

    now_hour = timezone.localtime().replace(minute=0, second=0, microsecond=0)
    date_start = timezone.make_aware(datetime.combine(measured_date, time.min), timezone.get_current_timezone())
    date_end = date_start + timedelta(days=1)
    start_at = max(date_start, now_hour + timedelta(hours=1)) if measured_date >= timezone.localdate() else date_start
    filters = {"station": station, "target_at__gte": start_at}
    if measured_date < timezone.localdate():
        filters["target_at__lt"] = date_end
    queryset = (
        HourlyDustPrediction.objects
        .filter(**filters)
        .order_by("target_at", "-predicted_at")
    )[:limit * 8]
    latest_by_target = {}

    def prediction_rank(prediction):
        ml_priority = 1 if prediction.model_name == "hist_gradient_boosting_pm10_v1" else 0
        return (prediction.predicted_at, ml_priority)

    for prediction in queryset:
        key = prediction.target_at
        existing = latest_by_target.get(key)
        if existing is None or prediction_rank(prediction) > prediction_rank(existing):
            latest_by_target[key] = prediction

    predictions = [latest_by_target[key] for key in sorted(latest_by_target.keys())[:limit]]
    return [_serialize_hourly_dust_prediction(prediction) for prediction in predictions]

def _merge_hourly_forecast_items(primary_items, fallback_items, limit=12):
    merged = []
    seen = set()
    for item in [*primary_items, *fallback_items]:
        key = f"{item.get('date')}-{item.get('hour')}"
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
        if len(merged) >= limit:
            break
    return merged

def _hourly_prediction_metrics(station, days=7, model_name=None):
    if not station:
        return {"available": False}

    cutoff = timezone.now() - timedelta(days=days)
    queryset = HourlyDustPrediction.objects.filter(
        station=station,
        evaluated_at__isnull=False,
        target_at__gte=cutoff,
    )
    if model_name:
        queryset = queryset.filter(model_name=model_name)
    rows = list(queryset.exclude(absolute_error__isnull=True).order_by("-target_at")[:200])
    if not rows:
        return {"available": False, "sampleCount": 0}

    mae = sum(row.absolute_error for row in rows if row.absolute_error is not None) / len(rows)
    rmse = math.sqrt(sum(row.squared_error for row in rows if row.squared_error is not None) / len(rows))
    return {
        "available": True,
        "sampleCount": len(rows),
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "windowDays": days,
        "modelName": rows[0].model_name,
    }

@api_view(['GET'])
def hourly_dust(request):
    city = request.GET.get('city')
    district = request.GET.get('region')
    date_param = request.GET.get('date')

    if not city or not district:
        return Response({"error": "city and region are required."}, status=400)

    measured_date = _parse_measure_date(date_param) if date_param else timezone.localdate()
    if not measured_date:
        return Response({"error": "date must be YYYYMMDD or YYYY-MM-DD."}, status=400)

    station_name = _resolve_station_name(city, district)
    station = _find_air_quality_station(city, station_name)
    items = _load_stored_realtime_hourly_dust(city, district, station_name, measured_date, station=station)
    source = "date"
    if not items and measured_date >= timezone.localdate() - timedelta(days=1):
        items = _load_recent_realtime_hourly_dust(city, district, station_name, station=station)
        source = "recent_24h"
    location = _current_station_location(city, station_name)
    weather_forecasts = []
    if location:
        grid = _dfs_grid_from_lat_lng(location["lat"], location["lng"])
        weather_forecasts = _fetch_kma_hourly_weather_forecast_by_grid(grid, limit=12)
    stored_forecast_items = _load_stored_hourly_dust_predictions(station, measured_date)
    generated_forecast_items = []
    if len(stored_forecast_items) >= 12:
        forecast_items = stored_forecast_items[:12]
        saved_predictions = 0
        prediction_source = "stored"
    else:
        generated_forecast_items = _build_hourly_dust_forecast(
            items,
            weather_forecasts,
            station=station,
            city=city,
            district=district,
        )
        saved_predictions = _store_hourly_dust_predictions(station, city, district, generated_forecast_items)
        forecast_items = _merge_hourly_forecast_items(stored_forecast_items, generated_forecast_items, limit=12)
        prediction_source = "stored_generated_fill" if stored_forecast_items else "generated"
    response_model_name = (forecast_items[0].get("modelName") if forecast_items else None) or "hourly_trend_weather_v1"
    return Response({
        "city": city,
        "region": district,
        "stationName": station_name,
        "date": measured_date.isoformat(),
        "source": source,
        "items": items,
        "forecastItems": forecast_items,
        "predictionModel": {
            "name": response_model_name,
            "source": prediction_source,
            "savedCount": saved_predictions,
            "metrics": _hourly_prediction_metrics(station, model_name=response_model_name),
            "note": "참고용 시간별 예측입니다. 저장된 예측과 실제 관측값이 쌓이면 오차 지표가 함께 제공됩니다.",
        },
        "weatherForecastItems": weather_forecasts,
    })

def _merge_past_items(*item_groups):
    merged_by_date = {}
    for items in item_groups:
        for item in items:
            key = str(item.get('msurDt', '')).split()[0]
            if key and key not in merged_by_date:
                merged_by_date[key] = item
    return sorted(merged_by_date.values(), key=lambda item: str(item.get('msurDt', '')))

def _latest_past_item_date(items):
    latest = None
    for item in items:
        measured_date = _parse_measure_date(str(item.get('msurDt', '')).split()[0])
        if measured_date and (latest is None or measured_date > latest):
            latest = measured_date
    return latest

@api_view(['GET'])
def past_dust(request):
    city = request.GET.get('city')
    district = request.GET.get('region')
    start_date = request.GET.get('startDate')
    end_date = request.GET.get('endDate')

    if not city or not district:
        return Response({"error": "파라미터가 없습니다."}, status=400)

    station_name = _resolve_station_name(city, district)

    params = {
        "serviceKey": AIRKOREA_SERVICE_KEY,
        "returnType": "json",
        "numOfRows": "100",
        "pageNo": "1",
        "inqBginDt": start_date,
        "inqEndDt": end_date,
        "msrstnName": station_name,
    }

    parsed_start = _parse_measure_date(start_date)
    parsed_end = _parse_measure_date(end_date)
    yesterday = timezone.localdate() - timedelta(days=1)
    if parsed_end and parsed_end > yesterday:
        parsed_end = yesterday
    effective_start_date = parsed_start.strftime('%Y%m%d') if parsed_start else start_date
    effective_end_date = parsed_end.strftime('%Y%m%d') if parsed_end else end_date

    stored_items = _load_stored_past_dust(city, district, station_name, effective_start_date, effective_end_date)
    realtime_daily_items = _load_stored_realtime_daily_dust(city, district, station_name, effective_start_date, effective_end_date)
    merged_items = _merge_past_items(stored_items, realtime_daily_items)
    api_items = []
    saved_count = 0

    latest_merged_date = _latest_past_item_date(merged_items)
    should_fetch_api = (
        parsed_start
        and parsed_end
        and (
            not merged_items
            or latest_merged_date is None
            or latest_merged_date < parsed_end
        )
    )
    if should_fetch_api:
        api_items, _ = _fetch_past_dust_items_by_station(station_name, parsed_start, parsed_end, allow_api=True)
        if api_items:
            saved_count = _store_past_dust_items(city, district, station_name, api_items)
            stored_items = _load_stored_past_dust(city, district, station_name, effective_start_date, effective_end_date)
            realtime_daily_items = _load_stored_realtime_daily_dust(city, district, station_name, effective_start_date, effective_end_date)
            merged_items = _merge_past_items(stored_items, realtime_daily_items, api_items)

    return Response({
        "items": merged_items,
        "api_count": len(api_items),
        "stored_count": len(stored_items),
        "realtime_daily_count": len(realtime_daily_items),
        "saved_count": saved_count,
        "source": "stored_first",
    })

    

    response = requests.get(API_URL, params=params, headers=AIRKOREA_HEADERS, timeout=15)
    try:
        data = response.json()
    except ValueError:
        return Response({
            "items": stored_items,
            "error": "AirKorea returned a non-JSON response.",
            "status": response.status_code,
            "preview": response.text[:200],
            "stored_count": len(stored_items),
        }, status=200 if stored_items else 502)
    items = data.get("response", {}).get("body", {}).get("items", [])
    saved_count = _store_past_dust_items(city, district, station_name, items)

    merged_by_date = {}
    for item in stored_items:
        key = str(item.get('msurDt', '')).split()[0]
        if key:
            merged_by_date[key] = item
    for item in items:
        key = str(item.get('msurDt', '')).split()[0]
        if key:
            merged_by_date[key] = item

    merged_items = sorted(merged_by_date.values(), key=lambda item: str(item.get('msurDt', '')))
    return Response({
        "items": merged_items,
        "api_count": len(items),
        "stored_count": len(stored_items),
        "saved_count": saved_count,
    })
