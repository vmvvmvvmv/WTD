from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

# 로컬 .env의 APP_TEST_TOKEN 설정과 무관하게 엔드포인트 동작만 검증한다.
@patch.dict('os.environ', {'APP_TEST_TOKEN': ''})
class CurrentDustEndpointTests(SimpleTestCase):
    @patch('dust.views._resolve_station_name', return_value='대신동')
    @patch('dust.views._load_realtime_station_values', return_value=({}, {}))
    @patch('dust.views._load_latest_daily_station_values', return_value={})
    @patch('dust.services.stations._candidate_stations_for_region', return_value=[])
    def test_missing_data_response(self, *_mocks):
        response = self.client.get('/dust/current/?city=부산&region=대신동')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['basis'], 'none')

    @patch('dust.views._resolve_station_name', return_value='대신동')
    @patch('dust.views._load_realtime_station_values', side_effect=RuntimeError('private upstream detail'))
    def test_upstream_error_is_logged_without_exposing_details(self, *_mocks):
        with self.assertLogs('dust.views', level='ERROR'):
            response = self.client.get('/dust/current/?city=부산&region=대신동')
        self.assertEqual(response.status_code, 500)
        self.assertNotIn('private upstream detail', response.content.decode())


class MobileMapScriptInjectionTests(SimpleTestCase):
    @patch.dict('os.environ', {'APP_TEST_TOKEN': ''})
    def test_query_values_cannot_close_inline_script(self):
        payload = '</script><script>alert(1)</script>'
        response = self.client.get('/dust/mobile-map/', {'view': payload, 'app_test_token': payload})
        self.assertEqual(response.status_code, 200)
        html = response.content.decode()
        self.assertNotIn(payload, html)
        self.assertIn('\u003C/script\u003E', html)


class NotificationCalendarPrivacyTests(SimpleTestCase):
    def _saved_calendar_events(self, morning_alerts):
        from dust.notification_registry import upsert_notification_device
        payload = {
            'expoPushToken': 'ExponentPushToken[test]',
            'city': '서울',
            'region': '송파구',
            'weatherMorningAlerts': morning_alerts,
            'calendarEvents': [{'title': '병원 진료', 'date': '2026-10-09', 'time': '09:00'}],
        }
        with patch('dust.notification_registry.NotificationDevice.objects.update_or_create', return_value=(object(), True)) as save:
            upsert_notification_device(payload)
        return save.call_args.kwargs['defaults']['calendar_events']

    def test_calendar_titles_are_not_stored_when_morning_alerts_are_off(self):
        self.assertEqual(self._saved_calendar_events(False), [])

    def test_only_date_and_time_are_stored_when_morning_alerts_are_on(self):
        # 예전 앱 버전이 제목을 보내도 서버는 날짜·시간만 저장한다.
        self.assertEqual(self._saved_calendar_events(True), [{'date': '2026-10-09', 'time': '09:00'}])


class OutfitClientKeyTests(SimpleTestCase):
    def _key(self, **meta):
        from django.test import RequestFactory
        from dust.memo_views import _client_key
        return _client_key(RequestFactory().post('/dust/calendar/memo-events/', **meta))

    def test_device_id_header_cannot_reset_llm_limit(self):
        base = self._key(REMOTE_ADDR='10.0.0.1')
        self.assertEqual(self._key(REMOTE_ADDR='10.0.0.1', HTTP_X_DEVICE_ID='random-1'), base)

    def test_forwarded_for_is_ignored_without_trusted_proxy(self):
        with self.settings(TRUSTED_PROXY_COUNT=0):
            self.assertEqual(
                self._key(REMOTE_ADDR='10.0.0.1', HTTP_X_FORWARDED_FOR='1.1.1.1'),
                self._key(REMOTE_ADDR='10.0.0.1', HTTP_X_FORWARDED_FOR='2.2.2.2'),
            )

    def test_uses_address_appended_by_trusted_proxy(self):
        with self.settings(TRUSTED_PROXY_COUNT=1):
            # 클라이언트가 앞쪽에 위조 IP를 넣어도 프록시가 붙인 마지막 주소로 구분한다.
            spoofed = self._key(REMOTE_ADDR='127.0.0.1', HTTP_X_FORWARDED_FOR='9.9.9.9, 203.0.113.5')
            real = self._key(REMOTE_ADDR='127.0.0.1', HTTP_X_FORWARDED_FOR='203.0.113.5')
            other_user = self._key(REMOTE_ADDR='127.0.0.1', HTTP_X_FORWARDED_FOR='203.0.113.6')
        self.assertEqual(spoofed, real)
        self.assertNotEqual(real, other_user)


class PredictionCachePolicyTests(SimpleTestCase):
    @patch('dust.services.prediction._fetch_past_dust_items_by_station', return_value=([], None))
    @patch('dust.services.prediction._load_stored_realtime_daily_dust', return_value=[])
    @patch('dust.services.prediction.DustMeasurement.objects.filter')
    @patch('dust.services.prediction._resolve_station_name', return_value='테스트측정소')
    def test_unavailable_prediction_is_not_cached_for_predict_endpoint(self, _station, measurements, *_mocks):
        from django.core.cache import cache
        from dust.services.prediction import _build_prediction_for_region
        measurements.return_value.order_by.return_value = []
        cache.delete('dust_predict_v10_테스트시_테스트구')

        result = _build_prediction_for_region('테스트시', '테스트구')

        self.assertEqual(result['predictions'], [])
        self.assertIsNone(cache.get('dust_predict_v10_테스트시_테스트구'))


class ExpoDeviceNotRegisteredTests(SimpleTestCase):
    def test_device_not_registered_ticket_raises_specific_error(self):
        from unittest.mock import MagicMock
        from dust.weather_morning_notifications import ExpoDeviceNotRegistered, send_expo_push
        response = MagicMock()
        response.json.return_value = {'data': {'status': 'error', 'details': {'error': 'DeviceNotRegistered'}}}
        with patch('dust.weather_morning_notifications.requests.post', return_value=response):
            with self.assertRaises(ExpoDeviceNotRegistered):
                send_expo_push('ExponentPushToken[gone]', 't', 'b', {})

    def test_unregistered_device_is_disabled(self):
        from datetime import date
        from types import SimpleNamespace
        from unittest.mock import MagicMock
        from dust.weather_morning_notifications import ExpoDeviceNotRegistered, send_weather_morning_notifications
        device = SimpleNamespace(city='서울', region='송파구', expo_push_token='ExponentPushToken[gone]',
                                 enabled=True, calendar_events=[{'title': '병원'}], save=MagicMock())
        module = 'dust.weather_morning_notifications'
        with patch(f'{module}.NotificationDevice.objects.filter', return_value=[device]), \
                patch(f'{module}.weather_points_for_region', return_value=[object()]), \
                patch(f'{module}.DustNotificationLog.objects.filter') as logs, \
                patch(f'{module}.events_for_date', return_value=[]), \
                patch(f'{module}.build_weather_morning_message', return_value=('title', 'body')), \
                patch(f'{module}.send_expo_push', side_effect=ExpoDeviceNotRegistered('gone')):
            logs.return_value.exists.return_value = False
            result = send_weather_morning_notifications(date(2026, 10, 9))
        self.assertEqual(result.failed, 1)
        self.assertFalse(device.enabled)
        self.assertEqual(device.calendar_events, [])
        device.save.assert_called_once()


@patch.dict('os.environ', {'APP_TEST_TOKEN': ''})
class PredictEndpointTests(SimpleTestCase):
    @patch('dust.views.build_forecast_prediction', return_value={'future_dates': ['2026-10-10'], 'predictions': [55]})
    def test_wraps_forecast_by_city_and_region(self, forecast):
        response = self.client.get('/dust/predict/', {'city': '서울', 'region': '송파구'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['서울']['송파구']['predictions'], [55])
        self.assertEqual(forecast.call_args.args[1], '서울')

    @patch('dust.views.build_forecast_prediction', side_effect=RuntimeError('private upstream detail'))
    def test_error_does_not_expose_details(self, _forecast):
        with self.assertLogs('dust.views', level='ERROR'):
            response = self.client.get('/dust/predict/', {'city': '서울', 'region': '송파구'})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn('private upstream detail', response.content.decode())


class AirKoreaForecastTests(SimpleTestCase):
    ITEMS = [
        {'informCode': 'PM10', 'informData': '2026-10-09', 'dataTime': '2026-10-08 05시 발표',
         'informGrade': '서울 : 좋음,경기남부 : 좋음,경기북부 : 좋음'},
        {'informCode': 'PM10', 'informData': '2026-10-09', 'dataTime': '2026-10-08 17시 발표',
         'informGrade': '서울 : 보통,경기남부 : 나쁨,경기북부 : 보통,영서 : 좋음'},
        {'informCode': 'PM25', 'informData': '2026-10-09', 'dataTime': '2026-10-08 23시 발표',
         'informGrade': '서울 : 매우나쁨'},
    ]

    def test_uses_latest_pm10_announcement(self):
        from dust.airkorea_forecast import latest_pm10_grades_by_date
        announced, grades = latest_pm10_grades_by_date(self.ITEMS)['2026-10-09']
        self.assertEqual(announced, '2026-10-08 17시 발표')
        self.assertEqual(grades['서울'], '보통')

    def test_split_region_uses_worse_grade_and_aliases(self):
        from dust.airkorea_forecast import grade_for_city, parse_grades
        grades = parse_grades(self.ITEMS[1]['informGrade'])
        self.assertEqual(grade_for_city(grades, '경기도'), '나쁨')
        self.assertEqual(grade_for_city(grades, '강원특별자치도'), '좋음')
        self.assertIsNone(grade_for_city(grades, '제주'))

    @patch('dust.airkorea_forecast.timezone.localdate')
    @patch('dust.airkorea_forecast._fetch_items')
    def test_builds_tomorrow_prediction_matching_app_thresholds(self, fetch, localdate):
        from datetime import date
        from django.core.cache import cache
        from dust.airkorea_forecast import build_forecast_prediction
        localdate.return_value = date(2026, 10, 8)
        cache.delete('airkorea_pm10_forecast_v1_2026-10-08')
        fetch.return_value = self.ITEMS
        result = build_forecast_prediction('key', '경기')
        self.assertEqual(result['future_dates'], ['2026-10-09'])
        self.assertEqual(result['grades'], ['나쁨'])
        self.assertGreater(result['predictions'][0], 80)  # 앱의 '나쁨' 기준(80 초과)과 일치

    @patch('dust.airkorea_forecast.timezone.localdate')
    @patch('dust.airkorea_forecast._fetch_items')
    def test_api_failure_returns_empty_prediction(self, fetch, localdate):
        import requests
        from datetime import date
        from django.core.cache import cache
        from dust.airkorea_forecast import build_forecast_prediction
        localdate.return_value = date(2026, 10, 7)
        cache.delete('airkorea_pm10_forecast_v1_2026-10-07')
        fetch.side_effect = requests.Timeout('serviceKey=secret')
        result = build_forecast_prediction('key', '서울')
        self.assertEqual(result['predictions'], [])
        self.assertFalse(result['model']['available'])

    @patch('dust.airkorea_forecast.timezone.localdate')
    def test_forecast_request_uses_short_timeout_and_caches_failure(self, localdate):
        import requests
        from datetime import date
        from django.core.cache import cache
        from dust.airkorea_forecast import build_forecast_prediction
        from dust.external_api import REQUEST_TIMEOUT
        localdate.return_value = date(2026, 10, 6)
        cache.delete('airkorea_pm10_forecast_v1_2026-10-06')
        with patch('dust.airkorea_forecast.public_api_get', side_effect=requests.Timeout('slow')) as api_get:
            build_forecast_prediction('key', '서울')
            build_forecast_prediction('key', '서울')
        self.assertEqual(api_get.call_count, 1)
        self.assertEqual(api_get.call_args.kwargs['timeout'], REQUEST_TIMEOUT)


@patch.dict('os.environ', {'APP_TEST_TOKEN': ''})
class OptionalFeatureRoutingTests(SimpleTestCase):
    def _reload_urls(self):
        import importlib
        from django.urls import clear_url_caches
        import config.urls
        import dust.urls
        importlib.reload(dust.urls)
        importlib.reload(config.urls)
        clear_url_caches()

    def tearDown(self):
        self._reload_urls()  # 다른 테스트에 영향을 주지 않도록 원래 설정으로 되돌린다.

    def test_optional_routes_are_not_exposed_when_disabled(self):
        with self.settings(ENABLE_OPTIONAL_FEATURES=False):
            self._reload_urls()
            for path in ('/dust/chat/', '/dust/weather/past/', '/analyze/compact/a&b'):
                self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_optional_routes_exist_when_enabled(self):
        from django.urls import resolve
        with self.settings(ENABLE_OPTIONAL_FEATURES=True):
            self._reload_urls()
            self.assertEqual(resolve('/analyze/compact/a&b').url_name, 'ai_short')


class StripCalendarTitlesMigrationTests(SimpleTestCase):
    def test_existing_titles_are_removed(self):
        import importlib
        from types import SimpleNamespace
        from unittest.mock import MagicMock
        migration = importlib.import_module('dust.migrations.0013_strip_calendar_event_titles')
        device = SimpleNamespace(
            calendar_events=[{'title': '병원 진료', 'date': '2026-10-09', 'time': '09:00'}, {'title': '날짜 없음'}],
            save=MagicMock(),
        )
        model = MagicMock()
        model.objects.all.return_value.iterator.return_value = [device]
        apps = SimpleNamespace(get_model=lambda *_: model)

        migration.strip_titles(apps, None)

        self.assertEqual(device.calendar_events, [{'date': '2026-10-09', 'time': '09:00'}])
        device.save.assert_called_once_with(update_fields=['calendar_events'])


class DustSpikeNotificationTests(SimpleTestCase):
    def setUp(self):
        from datetime import datetime
        self.now = timezone.make_aware(datetime(2026, 10, 10, 13, 0))

    def measurement(self, pm10, pm25, hour=10):
        from types import SimpleNamespace
        return SimpleNamespace(measured_at=self.now.replace(hour=hour), pm10_value=pm10, pm25_value=pm25)

    def test_current_bad_measurement(self):
        from dust.dust_spike_notifications import build_dust_spike_message
        self.assertEqual(build_dust_spike_message('강남구', '서울', self.measurement(95.4, 20), (None, None)),
                         ('강남구 미세먼지 나쁨', "지금 미세먼지가 '나쁨'이에요. 마스크를 챙기세요."))
        self.assertEqual(build_dust_spike_message('강남구', '서울', self.measurement(160, None), ('보통', None))[0], '강남구 미세먼지 매우 나쁨')

    def test_pm25_is_checked_too(self):
        from dust.dust_spike_notifications import build_dust_spike_message
        self.assertEqual(build_dust_spike_message('강남구', '서울', self.measurement(50, 48), (None, None))[0], '강남구 초미세먼지 나쁨')
        self.assertEqual(build_dust_spike_message('강남구', '서울', self.measurement(120, 80), (None, None))[0], '강남구 미세먼지·초미세먼지 매우 나쁨')

    def test_airkorea_forecast_names_region(self):
        from dust.dust_spike_notifications import build_dust_spike_message
        self.assertEqual(build_dust_spike_message('강남구', '서울', self.measurement(40, 20), ('나쁨', '2026-10-10 05시 발표')),
                         ('서울 미세먼지 예보 나쁨', "오늘 서울 미세먼지 예보가 '나쁨'이에요. 마스크를 챙기세요."))

    def test_no_alert_when_now_and_today_forecast_are_not_bad(self):
        from dust.dust_spike_notifications import build_dust_spike_message
        self.assertIsNone(build_dust_spike_message('강남구', '서울', self.measurement(80, 35), ('보통', None)))
        self.assertIsNone(build_dust_spike_message('강남구', '서울', None, (None, None)))

    def test_quiet_hours_send_nothing(self):
        from datetime import datetime
        from dust.dust_spike_notifications import send_dust_spike_notifications
        with patch('dust.dust_spike_notifications.NotificationDevice.objects.filter') as devices:
            result = send_dust_spike_notifications(now=timezone.make_aware(datetime(2026, 10, 10, 23, 0)))
        devices.assert_not_called()
        self.assertEqual(result.sent, 0)

    def test_sends_once_and_logs(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock
        from dust.dust_spike_notifications import send_dust_spike_notifications
        module = 'dust.dust_spike_notifications'
        device = SimpleNamespace(city='서울', region='강남구', expo_push_token='ExponentPushToken[x]', save=MagicMock())
        with patch(f'{module}.NotificationDevice.objects.filter', return_value=[device]), \
                patch(f'{module}.DustNotificationLog.objects') as logs, \
                patch(f'{module}._station_for_region', return_value=SimpleNamespace(name='강남구')), \
                patch(f'{module}._latest_measurement', return_value=self.measurement(100, 20)), \
                patch(f'{module}._today_forecast', return_value=(None, None)), \
                patch(f'{module}.send_expo_push') as push:
            logs.filter.return_value.exists.return_value = False
            result = send_dust_spike_notifications(now=self.now)
        self.assertEqual(result.sent, 1)
        push.assert_called_once()
        self.assertEqual(push.call_args.args[1], '강남구 미세먼지 나쁨')
        logs.update_or_create.assert_called_once()


class AirKoreaHourlyForecastTests(SimpleTestCase):
    def test_spreads_daily_grade_over_next_hours(self):
        from datetime import datetime
        from dust.airkorea_forecast import build_hourly_forecast_items
        now = timezone.make_aware(datetime(2026, 10, 10, 22, 30))
        forecast = {'2026-10-10': ('2026-10-10 17시 발표', {'서울': '보통'}), '2026-10-11': ('2026-10-10 17시 발표', {'서울': '나쁨'})}
        with patch('dust.airkorea_forecast.load_national_forecast', return_value=forecast):
            items = build_hourly_forecast_items('key', '서울특별시', now=now, hours=3)
        self.assertEqual([(item['hour'], item['pm10Value'], item['grade']) for item in items], [('23:00', 55, '보통'), ('00:00', 115, '나쁨'), ('01:00', 115, '나쁨')])
        self.assertTrue(all(item['phase'] == 'forecast' for item in items))

    def test_no_items_without_forecast(self):
        from dust.airkorea_forecast import build_hourly_forecast_items
        with patch('dust.airkorea_forecast.load_national_forecast', return_value=None):
            self.assertEqual(build_hourly_forecast_items('key', '서울'), [])


class PastDustRequestTimeoutTests(SimpleTestCase):
    """"최근 7일" 요청은 바깥 API가 느려도 짧게만 기다리고, 실패하면 잠깐 다시 부르지 않는다."""

    def setUp(self):
        from django.core.cache import cache
        for key in ('airkorea_past_station_failed_v1_테스트측정소', 'airkorea_past_station_v1_테스트측정소_20261001_20261007'):
            cache.delete(key)

    def test_failed_request_uses_short_timeout_and_is_not_retried_right_away(self):
        from datetime import date

        import requests

        from dust.external_api import REQUEST_TIMEOUT
        from dust.services.dust_history import _fetch_past_dust_items_by_station

        with patch('dust.services.dust_history.public_api_get', side_effect=requests.Timeout('slow')) as api_get:
            first = _fetch_past_dust_items_by_station('테스트측정소', date(2026, 10, 1), date(2026, 10, 7), allow_api=True)
            second = _fetch_past_dust_items_by_station('테스트측정소', date(2026, 10, 1), date(2026, 10, 7), allow_api=True)

        self.assertEqual(first[0], [])
        self.assertEqual(second[0], [])
        self.assertEqual(api_get.call_count, 1)
        self.assertEqual(api_get.call_args.kwargs['timeout'], REQUEST_TIMEOUT)


@patch.dict('os.environ', {'APP_TEST_TOKEN': ''})
class ErrorResponseShapeTests(SimpleTestCase):
    """오류는 상태 코드와 상관없이 {"error", "code"} 모양이고, 바깥 API 원문은 응답에 넣지 않는다."""

    def test_missing_parameter_returns_error_and_code(self):
        response = self.client.get('/dust/past/')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['code'], 'invalid_parameter')
        self.assertTrue(response.json()['error'])

    def test_malformed_json_uses_same_shape(self):
        response = self.client.post('/outfit/recommend/', data='{broken', content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json()), {'error', 'code'})

    @patch('dust.services.places.NAVER_SEARCH_CLIENT_ID', 'id')
    @patch('dust.services.places.NAVER_SEARCH_CLIENT_SECRET', 'secret')
    @patch('dust.services.places.public_api_get')
    def test_upstream_error_body_is_not_exposed(self, api_get):
        api_get.return_value.status_code = 401
        api_get.return_value.json.return_value = {'errorMessage': 'private upstream detail'}
        response = self.client.get('/dust/places/naver-search/', {'query': '카페'})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {'error': '장소 검색에 실패했습니다.', 'code': 'upstream_failed'})

    @patch.dict('os.environ', {'APP_TEST_TOKEN': 'secret-token'})
    def test_missing_access_token_uses_same_shape(self):
        response = self.client.get('/dust/past/')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'forbidden')


class PurgeOldRecordsTests(TestCase):
    def test_deletes_only_records_past_retention(self):
        from datetime import timedelta

        from django.core.management import call_command

        from dust.models import DustNotificationLog, LlmDailyUsage, NotificationDevice

        now = timezone.now()
        old = now - timedelta(days=31)
        LlmDailyUsage.objects.create(day=old.date(), client_digest='old', count=3)
        LlmDailyUsage.objects.create(day=now.date(), client_digest='new', count=1)
        off = NotificationDevice.objects.create(expo_push_token='ExponentPushToken[off]', city='서울', region='송파구', enabled=False)
        on = NotificationDevice.objects.create(expo_push_token='ExponentPushToken[on]', city='서울', region='송파구', enabled=True)
        recent_off = NotificationDevice.objects.create(expo_push_token='ExponentPushToken[recent]', city='서울', region='송파구', enabled=False)
        # auto_now 필드는 save()가 덮어쓰므로 update()로 과거 시각을 넣는다.
        NotificationDevice.objects.filter(pk__in=[off.pk, on.pk]).update(updated_at=old)
        log = DustNotificationLog.objects.create(device=on, notification_type='t', city='서울', region='송파구', basis_key='k')
        DustNotificationLog.objects.filter(pk=log.pk).update(created_at=old)

        call_command('purge_old_records', stdout=open(__import__('os').devnull, 'w'))

        self.assertEqual(list(LlmDailyUsage.objects.values_list('client_digest', flat=True)), ['new'])
        # 꺼진 지 30일 넘은 기기만 지우고, 켜져 있는 기기와 최근에 끈 기기는 남긴다.
        self.assertEqual(set(NotificationDevice.objects.values_list('pk', flat=True)), {on.pk, recent_off.pk})
        self.assertFalse(DustNotificationLog.objects.exists())


class PrivacyPageTests(SimpleTestCase):
    @patch.dict('os.environ', {'APP_TEST_TOKEN': 'secret-token'})
    def test_privacy_policy_is_public(self):
        # 스토어와 앱에서 누구나 열 수 있어야 하므로 앱 접근 토큰 없이도 열린다.
        response = self.client.get('/privacy/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '개인정보 처리방침')


class AppTestTokenTests(SimpleTestCase):
    @patch.dict('os.environ', {'APP_TEST_TOKEN': 'secret-token'})
    def test_non_ascii_token_is_rejected_not_crashed(self):
        response = self.client.get('/dust/current/', {'app_test_token': '토큰'})
        self.assertEqual(response.status_code, 403)


class MapLatestWeatherTests(TestCase):
    """지도 기온은 지금 시각 이전의 최신 값을 쓰고, 수집하지 않은 격자는 가장 가까운 수집 격자 값을 쓴다."""

    def test_uses_current_value_and_nearest_grid_fallback(self):
        from datetime import timedelta
        from dust.models import WeatherHourlyMeasurement
        from dust.services.common import _dfs_grid_from_lat_lng
        from dust.services.weather import _latest_weather_by_grid_for_locations

        seoul = {"lat": 37.5665, "lng": 126.9780}
        nearby = {"lat": 37.4000, "lng": 127.1000}
        seoul_grid = _dfs_grid_from_lat_lng(seoul["lat"], seoul["lng"])
        nearby_grid = _dfs_grid_from_lat_lng(nearby["lat"], nearby["lng"])
        self.assertNotEqual((seoul_grid["nx"], seoul_grid["ny"]), (nearby_grid["nx"], nearby_grid["ny"]))
        now = timezone.now()
        WeatherHourlyMeasurement.objects.create(nx=seoul_grid["nx"], ny=seoul_grid["ny"], measured_at=now - timedelta(hours=1), temperature=10)
        WeatherHourlyMeasurement.objects.create(nx=seoul_grid["nx"], ny=seoul_grid["ny"], measured_at=now + timedelta(hours=48), temperature=30)

        latest = _latest_weather_by_grid_for_locations({"a": seoul, "b": nearby})

        self.assertEqual(latest[(seoul_grid["nx"], seoul_grid["ny"])]["weatherTemperature"], 10)
        self.assertEqual(latest[(nearby_grid["nx"], nearby_grid["ny"])]["weatherTemperature"], 10)


class NeighborSpikeTests(SimpleTestCase):
    """주변 측정소보다 혼자 크게 튄 값은 버리고, 넓은 지역이 함께 높으면 그대로 둔다."""

    def _grid(self, center_value, neighbor_value):
        points = [(37.50, 127.00, {"pm10": center_value, "pm25": 10})]
        for index in range(5):
            points.append((37.50 + 0.02 * (index + 1), 127.00, {"pm10": neighbor_value, "pm25": 10}))
        return points

    def test_isolated_spike_is_dropped(self):
        from dust.services.dust_quality import _neighbor_spike_fields
        self.assertEqual(_neighbor_spike_fields(self._grid(699, 27))[0], {"pm10"})

    def test_regional_high_is_kept(self):
        from dust.services.dust_quality import _neighbor_spike_fields
        self.assertEqual(_neighbor_spike_fields(self._grid(180, 150))[0], set())

    def test_small_rise_is_kept(self):
        from dust.services.dust_quality import _neighbor_spike_fields
        self.assertEqual(_neighbor_spike_fields(self._grid(40, 15))[0], set())


class StoreNeighborSpikeTests(TestCase):
    """저장할 때: 한 시간만 혼자 튄 값은 비우고, 직전 시각에도 높았던 측정소(실제 지역 오염)는 그대로 둔다."""

    def setUp(self):
        from dust.models import AirQualityStation
        self.center = AirQualityStation.objects.create(sido='충남', name='중심', lat=36.40, lng=127.00)
        for index in range(5):
            AirQualityStation.objects.create(sido='충남', name=f'주변{index}', lat=36.40 + 0.02 * (index + 1), lng=127.00)

    def _store(self, center_pm10):
        from dust.services.stations import _store_realtime_values_to_db
        values = {'충남:중심': {'sido': '충남', 'name': '중심', 'pm10': str(center_pm10), 'pm25': '10', 'aqi': '226', 'time': '2026-10-23 20:00'}}
        for index in range(5):
            values[f'충남:주변{index}'] = {'sido': '충남', 'name': f'주변{index}', 'pm10': '25', 'pm25': '10', 'time': '2026-10-23 20:00'}
        _store_realtime_values_to_db(values)
        from dust.models import RealtimeDustMeasurement
        from datetime import datetime, timezone as dt_timezone
        return RealtimeDustMeasurement.objects.get(station=self.center, measured_at=datetime(2026, 10, 23, 11, tzinfo=dt_timezone.utc)).pm10_value

    def test_one_hour_spike_is_cleared(self):
        self.assertIsNone(self._store(699))

    def test_sustained_high_is_kept(self):
        from datetime import datetime, timezone as dt_timezone
        from dust.models import RealtimeDustMeasurement
        RealtimeDustMeasurement.objects.create(station=self.center, measured_at=datetime(2026, 10, 23, 10, tzinfo=dt_timezone.utc), pm10_value=91)
        self.assertEqual(self._store(95), 95)

    def test_first_hour_is_restored_when_high_continues(self):
        from datetime import datetime, timezone as dt_timezone
        from dust.models import RealtimeDustMeasurement
        first = RealtimeDustMeasurement.objects.create(station=self.center, measured_at=datetime(2026, 10, 23, 10, tzinfo=dt_timezone.utc), pm10_value=None, raw_data={'rawPM10': '117', 'rawAQI': '160', 'qualityNote': 'neighbor_spike_removed'})
        self._store(105)
        first.refresh_from_db()
        self.assertEqual(first.pm10_value, 117)
        self.assertEqual(first.aqi_value, 160)
        self.assertNotIn('qualityNote', first.raw_data)

    def test_cleared_spike_keeps_original_aqi(self):
        from datetime import datetime, timezone as dt_timezone
        from dust.models import RealtimeDustMeasurement
        self.assertIsNone(self._store(699))
        row = RealtimeDustMeasurement.objects.get(station=self.center, measured_at=datetime(2026, 10, 23, 11, tzinfo=dt_timezone.utc))
        self.assertIsNone(row.aqi_value)
        self.assertEqual(row.raw_data.get('rawAQI'), '226')

    def test_second_high_hour_is_kept_even_if_first_was_cleared(self):
        from datetime import datetime, timezone as dt_timezone
        from dust.models import RealtimeDustMeasurement
        RealtimeDustMeasurement.objects.create(station=self.center, measured_at=datetime(2026, 10, 23, 10, tzinfo=dt_timezone.utc), pm10_value=None, raw_data={'rawPM10': '117', 'qualityNote': 'neighbor_spike_removed'})
        self.assertEqual(self._store(105), 105)


class StationNamePriorityTests(TestCase):
    """지역 이름에 시와 면이 같이 있으면 더 구체적인 면·동 측정소를 고른다."""

    def test_prefers_most_specific_station(self):
        from dust.models import AirQualityStation
        from dust.services.stations import _resolve_station_name
        AirQualityStation.objects.create(sido='충남', name='공주', addr='충남 공주시 신관동', lat=36.47, lng=127.12)
        AirQualityStation.objects.create(sido='충남', name='탄천면', addr='충남 공주시 탄천면', lat=36.33, lng=127.08)
        self.assertEqual(_resolve_station_name('충남', '공주시 탄천면'), '탄천면')
        self.assertEqual(_resolve_station_name('충남', '탄천면'), '탄천면')
        self.assertEqual(_resolve_station_name('충남', '공주시'), '공주')


class DustCacheVersionTests(SimpleTestCase):
    """수집이 끝나면 캐시 버전을 올린다. 그 전에 읽기 시작한 요청이 늦게 넣은 옛 결과는 다음 요청이 보지 않는다."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def test_result_cached_during_collection_is_not_served_after(self):
        from dust.services import stations

        def load_while_collector_finishes():
            stations.bump_dust_cache_version()  # 요청이 DB를 읽는 사이 수집이 끝났다.
            return {'충남:탄천면': {'pm10': 'old'}}

        with patch.object(stations, '_load_latest_realtime_values_from_db', side_effect=load_while_collector_finishes):
            stations._load_realtime_station_values()
        with patch.object(stations, '_load_latest_realtime_values_from_db', return_value={'충남:탄천면': {'pm10': 'new'}}):
            self.assertEqual(stations._load_realtime_station_values()['충남:탄천면']['pm10'], 'new')


class AirKoreaMidnightTimeTests(SimpleTestCase):
    """에어코리아는 자정을 '24:00'으로 표기한다. 다음 날 0시로 읽는다."""

    def test_24_00_is_next_day_midnight(self):
        from django.utils import timezone as dj_timezone
        from dust.services.airkorea_client import _parse_airkorea_datetime
        parsed = dj_timezone.localtime(_parse_airkorea_datetime('2026-10-22 24:00'))
        self.assertEqual(parsed.strftime('%Y-%m-%d %H:%M'), '2026-10-23 00:00')
        self.assertEqual(dj_timezone.localtime(_parse_airkorea_datetime('2026-10-31 24:00')).strftime('%Y-%m-%d %H:%M'), '2026-11-01 00:00')


class FixMidnightTimesMigrationTests(TestCase):
    """'24:00' 값이 1시로 잘못 저장된 행을 다음 날 0시로 옮기고, 0시 행이 이미 있으면 잘못된 쪽만 지운다."""

    def test_moves_or_drops_misplaced_midnight_rows(self):
        import importlib
        from datetime import datetime, timezone as dt_timezone
        from django.apps import apps
        from dust.models import AirQualityStation, RealtimeDustMeasurement
        migration = importlib.import_module('dust.migrations.0016_fix_airkorea_midnight_times')
        utc = dt_timezone.utc
        midnight = datetime(2026, 10, 22, 15, tzinfo=utc)   # 10-23 00:00 KST
        one_am = datetime(2026, 10, 22, 16, tzinfo=utc)     # 10-23 01:00 KST
        moved = AirQualityStation.objects.create(sido='부산', name='가', lat=35.1, lng=129.0)
        dup = AirQualityStation.objects.create(sido='부산', name='나', lat=35.2, lng=129.0)
        RealtimeDustMeasurement.objects.create(station=moved, measured_at=one_am, pm10_value=30, raw_data={'time': '2026-10-22 24:00'})
        RealtimeDustMeasurement.objects.create(station=dup, measured_at=midnight, pm10_value=40, raw_data={'time': '2026-10-22 24:00'})
        RealtimeDustMeasurement.objects.create(station=dup, measured_at=one_am, pm10_value=40, pm25_value=12, raw_data={'time': '2026-10-22 24:00'})
        RealtimeDustMeasurement.objects.create(station=dup, measured_at=datetime(2026, 10, 22, 17, tzinfo=utc), pm10_value=50, raw_data={'time': '2026-10-23 02:00'})

        migration.fix_midnight_times(apps, None)

        self.assertEqual(list(RealtimeDustMeasurement.objects.filter(station=moved).values_list('measured_at', flat=True)), [midnight])
        self.assertEqual(sorted(RealtimeDustMeasurement.objects.filter(station=dup).values_list('pm10_value', flat=True)), [40, 50])
        self.assertEqual(RealtimeDustMeasurement.objects.get(station=dup, measured_at=midnight).pm25_value, 12)  # 빈 값은 채운다.


@patch.dict('os.environ', {'APP_TEST_TOKEN': ''})
class BadInputReturns400Tests(TestCase):
    """이상한 입력은 500이 아니라 400으로 돌려준다(극한 입력 검사에서 나온 경우들)."""

    def test_weather_rejects_impossible_coordinates(self):
        for lat, lng in (('91', '127'), ('37.5', '181'), ('NaN', '127'), ('37.5', 'Infinity')):
            for path in ('/dust/weather/current/', '/dust/weather/hourly/'):
                self.assertEqual(self.client.get(path, {'lat': lat, 'lng': lng}).status_code, 400, (path, lat, lng))

    def test_outfit_rejects_impossible_time(self):
        response = self.client.post('/outfit/recommend/', {'start': '2026-10-23T25:00', 'mode': 'rule'}, content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_notification_register_rejects_bad_body(self):
        for body in ([], None, {'expoPushToken': 'x' * 300, 'city': '서울', 'region': '강남구'}, {'expoPushToken': 'ExponentPushToken[a]', 'city': '서울' * 30, 'region': '강남구'}):
            response = self.client.post('/dust/notifications/register/', body, content_type='application/json')
            self.assertEqual(response.status_code, 400, str(body)[:60])


class ThunderLabelTests(TestCase):
    """기상청 낙뢰(LGT)가 있으면 날씨 이름에 천둥번개를 넣는다. 비·눈과 같이 오면 둘 다 남긴다."""

    def test_label_includes_thunder(self):
        from dust.services.weather import _kma_current_weather_label
        self.assertEqual(_kma_current_weather_label('0', '1', '2'), '천둥번개')
        self.assertEqual(_kma_current_weather_label('1', '4', '1'), '비·천둥번개')
        self.assertEqual(_kma_current_weather_label('3', '4', '1'), '눈·천둥번개')
        self.assertEqual(_kma_current_weather_label('1', '4', '0'), '비')
        self.assertEqual(_kma_current_weather_label('0', '1'), '맑음')

    def test_stored_hour_uses_lightning(self):
        from dust.services.weather import _store_weather_hourly_measurement
        measurement = _store_weather_hourly_measurement({'nx': 60, 'ny': 127}, '202610231500', {'T1H': '20', 'PTY': '1', 'SKY': '4', 'LGT': '1'})
        self.assertEqual(measurement.label, '비·천둥번개')


class CollectorRobustnessTests(TestCase):
    """바깥 API가 이상한 값을 보내도 수집이 통째로 멈추지 않는다."""

    def test_to_float_drops_nan_and_infinity(self):
        from dust.services.common import _to_float
        for value in ('NaN', 'nan', 'Infinity', '-Infinity', float('nan'), float('inf')):
            self.assertIsNone(_to_float(value), value)
        self.assertEqual(_to_float('12.5'), 12.5)

    def test_one_failing_midterm_region_does_not_stop_others(self):
        from dust.midterm_weather import MIDTERM_REGIONS
        from dust.services import weather

        calls = []

        def store(region, tm_fc):
            calls.append(region['key'])
            if region['key'] == MIDTERM_REGIONS[0]['key']:
                raise ValueError('XML 오류 응답')
            return 1

        with patch.object(weather, '_store_midterm_forecast_for_region', side_effect=store):
            saved = weather.collect_midterm_weather_forecasts(MIDTERM_REGIONS[:3])
        self.assertEqual(saved, 2)
        self.assertEqual(len(set(calls)), 3)



class MixedPrecipitationOutfitTests(SimpleTestCase):
    """기상청 강수형태가 비/눈(2)·빗방울눈날림(6)이면 우산도 챙긴다. 눈만 오면 우산은 넣지 않는다."""

    def _must_have(self, precipitation_type, label):
        from dust.services.outfit.aggregation import WeatherPoint, aggregate_schedule_window
        from dust.services.outfit.rule_engine import build_rule_result
        snapshot = aggregate_schedule_window([WeatherPoint(temperature=0, wind_speed=2, rain_mm=1, precipitation_type=precipitation_type, label=label)], [])
        return [item['type'] for item in build_rule_result(snapshot, activity_type='outdoor', sensitivity='normal', occasion='general')['must_have']]

    def test_mixed_rain_and_snow_adds_umbrella(self):
        for code in ('2', '6'):
            types = self._must_have(code, '비/눈')
            self.assertIn('waterproof_shoes', types, code)
            self.assertIn('umbrella', types, code)

    def test_snow_only_has_no_umbrella(self):
        self.assertNotIn('umbrella', self._must_have('3', '눈'))


class MorningEventLinesTests(SimpleTestCase):
    """아침 알림의 일정 줄은 같은 시각을 하나로 합치고 3줄까지만 보여 준다."""

    def test_event_lines_are_deduplicated_and_capped(self):
        from datetime import datetime
        from django.utils import timezone as dj_timezone
        from dust.models import WeatherHourlyMeasurement
        from dust.weather_morning_notifications import build_weather_morning_message
        tz = dj_timezone.get_current_timezone()
        points = [WeatherHourlyMeasurement(measured_at=dj_timezone.make_aware(datetime(2026, 10, 24, hour), tz), temperature=15, rain_mm=2, rain_probability=90, label='비', precipitation_type='1') for hour in range(8, 20)]
        events = [{'date': '2026-10-24', 'time': time} for time in ('09:00', '09:00', '09:00', '10:00', '11:00', '12:00', '13:00')]
        _title, body = build_weather_morning_message('대신동', points, events)
        lines = [line for line in body.splitlines() if '일정 때' in line]
        self.assertEqual(len(lines), 3)
        self.assertEqual(len(set(lines)), 3)


class EarlyEventWeatherNotificationTests(TestCase):
    """7시 전에 시작하는 일정은 아침 알림과 따로, 약 1시간 전에 그 시간 날씨를 한 번 보낸다."""

    def setUp(self):
        from dust.models import NotificationDevice
        self.device = NotificationDevice.objects.create(
            expo_push_token='ExponentPushToken[early]', city='부산', region='대신동', enabled=True, weather_morning_alerts=True,
            calendar_events=[{'date': '2026-10-25', 'time': '06:00'}, {'date': '2026-10-25', 'time': '09:00'}],
        )

    def _run(self, hour, minute=45):
        from datetime import datetime
        from django.utils import timezone as dj_timezone
        from dust import weather_morning_notifications as module
        from dust.models import WeatherHourlyMeasurement
        tz = dj_timezone.get_current_timezone()
        now = dj_timezone.make_aware(datetime(2026, 10, 25, hour, minute), tz)
        point = WeatherHourlyMeasurement(measured_at=dj_timezone.make_aware(datetime(2026, 10, 25, 6), tz), temperature=4, rain_mm=2, rain_probability=80, label='비', precipitation_type='1')
        messages = []
        with patch.object(module, 'weather_points_for_region', return_value=[point]), patch.object(module, 'send_expo_push', side_effect=lambda token, title, body, data: messages.append((title, body))):
            result = module.send_early_event_weather_notifications(now=now, write=lambda _m: None)
        return result, messages

    def test_sends_once_about_an_hour_before(self):
        result, messages = self._run(3)
        self.assertEqual(result.sent, 0)  # 06:00은 아직 멀다
        result, messages = self._run(4)
        self.assertEqual(result.sent, 1)
        self.assertIn('06:00', messages[0][0])
        self.assertIn('비', messages[0][1])
        result, _ = self._run(4)
        self.assertEqual(result.sent, 0)  # 같은 일정은 한 번만

    def test_events_from_seven_are_left_to_the_morning_push(self):
        self.device.calendar_events = [{'date': '2026-10-25', 'time': '07:30'}]
        self.device.save()
        result, _ = self._run(6)
        self.assertEqual(result.sent, 0)


class CurrentObservationTests(TestCase):
    """지금 시각 한 행은 기상청 초단기실황(실측)으로 덮고, 실황에 없는 하늘 상태·강수확률은 예보 값을 둔다."""

    def test_current_hour_uses_observation(self):
        from datetime import datetime
        from django.utils import timezone as dj_timezone
        from dust.models import WeatherHourlyMeasurement
        from dust.services import weather
        tz = dj_timezone.get_current_timezone()
        hour = dj_timezone.make_aware(datetime(2026, 10, 24, 18), tz)
        WeatherHourlyMeasurement.objects.create(nx=98, ny=76, measured_at=hour, temperature=10, rain_probability=30, sky='3', label='흐림', raw_data={'T1H': '10', 'SKY': '3', 'POP': '30', 'LGT': '0', 'PTY': '0'})

        class Response:
            status_code = 200

            def json(self):
                items = [{'category': c, 'obsrValue': v} for c, v in (('T1H', '12.3'), ('REH', '81'), ('WSD', '3.4'), ('VEC', '200'), ('RN1', '0'), ('PTY', '0'))]
                return {'response': {'header': {'resultCode': '00'}, 'body': {'items': {'item': items}}}}

        with patch.object(weather, 'public_api_get', return_value=Response()):
            stored = weather._store_current_observation({'nx': 98, 'ny': 76}, now=dj_timezone.make_aware(datetime(2026, 10, 24, 18, 45), tz))
        row = WeatherHourlyMeasurement.objects.get(nx=98, ny=76, measured_at=hour)
        self.assertIsNotNone(stored)
        self.assertEqual(row.temperature, 12.3)
        self.assertEqual(row.humidity, 81)
        self.assertEqual(row.sky, '3')
        self.assertEqual(row.rain_probability, 30)
        self.assertEqual(row.label, '흐림')


class WeatherWarningTests(TestCase):
    STATUS = (
        "o 태풍경보 : 제주도남쪽바깥먼바다\r\n"
        "o 강풍주의보 : 전라남도(거문도.초도, 완도여서도), 제주도(제주시서부, 제주시북부 제외)\r\n"
        "o 호우경보 : 부산, 경기도(연천, 포천, 가평), 서울(서울동남권)\r\n"
        "o 대설주의보 : 강원도(태백 제외)"
    )

    def _applies(self, sido, sigungu):
        from dust.weather_warning_notifications import parse_warning_status, warning_applies
        return sorted(w.kind + w.level for w in parse_warning_status(self.STATUS) if warning_applies(w, sido, sigungu))

    def test_region_matching(self):
        self.assertEqual(self._applies('제주', '제주시'), ['강풍주의보'])  # 일부만 제외 → 나머지 지역 특보
        self.assertEqual(self._applies('부산', '서구'), ['호우경보'])
        self.assertEqual(self._applies('경기', '수원시'), [])
        self.assertEqual(self._applies('경기', '포천시'), ['호우경보'])
        self.assertEqual(self._applies('서울', '강남구'), ['호우경보'])
        self.assertEqual(self._applies('서울', '종로구'), [])
        self.assertEqual(self._applies('강원', '태백시'), [])
        self.assertEqual(self._applies('강원', '춘천시'), ['대설주의보'])

    @patch('dust.weather_warning_notifications.send_expo_push')
    @patch('dust.weather_warning_notifications._station_for_region')
    def test_push_once_and_quiet_hours(self, station_for_region, push):
        from datetime import datetime, timedelta
        from types import SimpleNamespace
        from dust.models import NotificationDevice
        from dust.weather_warning_notifications import send_weather_warning_notifications
        station_for_region.return_value = SimpleNamespace(sido='부산', addr='부산 서구 대신로 150')
        NotificationDevice.objects.create(expo_push_token='ExponentPushToken[w]', city='부산', region='대신동', enabled=True, weather_warning_alerts=True)
        noon = timezone.make_aware(datetime(2026, 10, 25, 12, 0))
        first = send_weather_warning_notifications(now=noon, status_text=self.STATUS)
        again = send_weather_warning_notifications(now=noon + timedelta(hours=1), status_text=self.STATUS)
        self.assertEqual((first.sent, again.sent), (1, 0))
        self.assertIn('호우경보', push.call_args.args[1])
        # 밤에는 주의보를 보내지 않는다.
        night = send_weather_warning_notifications(now=timezone.make_aware(datetime(2026, 10, 26, 23, 0)), status_text="o 강풍주의보 : 부산")
        self.assertEqual(night.sent, 0)


class PushReceiptTests(TestCase):
    def test_receipts_disable_uninstalled_devices_and_count_failures(self):
        from datetime import timedelta
        from unittest.mock import MagicMock
        from dust.models import ExpoPushTicket, NotificationDevice
        from dust.push_receipts import check_push_receipts
        gone = NotificationDevice.objects.create(expo_push_token='ExponentPushToken[gone]', city='부산', region='대신동', calendar_events=[{'title': 'x'}])
        NotificationDevice.objects.create(expo_push_token='ExponentPushToken[ok]', city='부산', region='대신동')
        for ticket_id, token in [('t-ok', 'ok'), ('t-gone', 'gone'), ('t-fcm', 'ok'), ('t-wait', 'ok'), ('t-new', 'ok')]:
            ExpoPushTicket.objects.create(ticket_id=ticket_id, expo_push_token=f'ExponentPushToken[{token}]')
        now = timezone.now()
        ExpoPushTicket.objects.exclude(ticket_id='t-new').update(created_at=now - timedelta(minutes=20))
        response = MagicMock()
        response.json.return_value = {'data': {
            't-ok': {'status': 'ok'},
            't-gone': {'status': 'error', 'details': {'error': 'DeviceNotRegistered'}},
            't-fcm': {'status': 'error', 'details': {'error': 'DeveloperError'}},
        }}
        with patch('dust.push_receipts.requests.post', return_value=response) as post:
            result = check_push_receipts(now=now)
        self.assertEqual(sorted(post.call_args.kwargs['json']['ids']), ['t-fcm', 't-gone', 't-ok', 't-wait'])
        self.assertEqual((result.ok, result.failed, result.unregistered), (1, 1, 1))
        gone.refresh_from_db()
        self.assertFalse(gone.enabled)
        self.assertEqual(gone.calendar_events, [])
        # 결과가 아직 없는 티켓과 15분이 안 된 티켓은 남겨 다음에 다시 묻는다.
        self.assertEqual(sorted(ExpoPushTicket.objects.values_list('ticket_id', flat=True)), ['t-new', 't-wait'])

    def test_accepted_push_keeps_ticket_for_receipt_check(self):
        from unittest.mock import MagicMock
        from dust.models import ExpoPushTicket
        from dust.weather_morning_notifications import send_expo_push
        response = MagicMock()
        response.json.return_value = {'data': {'status': 'ok', 'id': 'ticket-1'}}
        with patch('dust.weather_morning_notifications.requests.post', return_value=response):
            send_expo_push('ExponentPushToken[a]', 't', 'b', {})
        self.assertTrue(ExpoPushTicket.objects.filter(ticket_id='ticket-1', expo_push_token='ExponentPushToken[a]').exists())


class LateMorningNotificationTests(SimpleTestCase):
    def test_morning_notifications_skip_after_ten(self):
        from datetime import datetime
        from dust.weather_morning_notifications import send_weather_morning_notifications
        late = timezone.make_aware(datetime(2026, 10, 25, 14, 0))
        with patch('dust.weather_morning_notifications.timezone.localtime', return_value=late), \
                patch('dust.weather_morning_notifications.timezone.localdate', return_value=late.date()), \
                patch('dust.weather_morning_notifications.NotificationDevice.objects.filter') as devices:
            result = send_weather_morning_notifications(late.date())
        devices.assert_not_called()
        self.assertEqual(result.sent, 0)


class KmaMissingValueTests(SimpleTestCase):
    def test_kma_sentinels_are_stored_as_missing(self):
        from dust.services.weather import _kma_float
        self.assertIsNone(_kma_float('-999'))
        self.assertIsNone(_kma_float('-998.9'))
        self.assertIsNone(_kma_float('900'))
        self.assertEqual(_kma_float('-12.5'), -12.5)
        self.assertEqual(_kma_float('0'), 0.0)


class DustBackfillTests(TestCase):
    """서버가 멈췄던 시각만 채우고, 있던 기록은 건드리지 않는다."""

    def test_fills_only_hours_most_stations_missed(self):
        from datetime import datetime, timedelta, timezone as dt_timezone
        from dust.models import AirQualityStation, RealtimeDustMeasurement
        from dust.services import dust_backfill
        now = datetime(2026, 10, 25, 12, 30, tzinfo=dt_timezone.utc)
        stations = [AirQualityStation.objects.create(sido='부산', name=f'측정소{i}', lat=35.1, lng=129.0 + i * 0.01) for i in range(10)]
        hours = [now.replace(minute=0) - timedelta(hours=h) for h in range(24, -1, -1)]
        outage = set(hours[10:13])  # 3시간 동안 서버가 멈춤
        for station in stations:
            for hour in hours:
                if hour not in outage and not (station.name == '측정소9' and hour == hours[5]):  # 고장 난 측정소 한 칸
                    RealtimeDustMeasurement.objects.create(station=station, measured_at=hour, pm10_value=20)
        self.assertEqual(dust_backfill.find_gap_hours(now), sorted(outage))

        def rows(station):
            return [{'dataTime': (hour + timedelta(hours=9)).strftime('%Y-%m-%d %H:%M'), 'pm10Value': '33', 'pm25Value': '11', 'pm10Flag': None} for hour in hours]

        with patch.object(dust_backfill, '_hourly_rows_for_station', side_effect=rows):
            filled, created, left = dust_backfill.backfill_missing_dust(limit=4, now=now)
        self.assertEqual((filled, created, left), (4, 12, 6))
        self.assertEqual(RealtimeDustMeasurement.objects.filter(raw_data__source='backfill').count(), 12)
        # 원래 있던 기록과 고장 난 측정소의 빈칸(수집이 빠진 시각이 아님)은 그대로다.
        self.assertFalse(RealtimeDustMeasurement.objects.filter(measured_at=hours[5], station__name='측정소9').exists())
        self.assertEqual(RealtimeDustMeasurement.objects.filter(measured_at=hours[0]).exclude(pm10_value=20).count(), 0)


class AdminAlertTests(SimpleTestCase):
    @patch.dict('os.environ', {'ADMIN_PUSH_TOKENS': 'ExponentPushToken[admin]'})
    def test_same_problem_is_sent_once(self):
        from django.core.cache import cache
        from dust import admin_alerts
        cache.delete('admin_alert:freshness:x')
        with patch.object(admin_alerts, 'send_expo_push') as push:
            self.assertEqual(admin_alerts.alert_admins('freshness:x', 't', 'b'), 1)
            self.assertEqual(admin_alerts.alert_admins('freshness:x', 't', 'b'), 0)
        push.assert_called_once()
        cache.delete('admin_alert:freshness:x')
