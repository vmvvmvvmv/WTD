from unittest.mock import patch

from django.test import SimpleTestCase
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
        from dust.outfit_views import _client_key
        return _client_key(RequestFactory().post('/outfit/recommend/', **meta))

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


class DailyOutfitCacheTests(SimpleTestCase):
    """하루 단위 옷차림 캐시에는 일정 제목을 저장하지 않는다."""

    def _key(self, occasion, schedule_id='event-1'):
        from dust.services.outfit.context_builder import build_outfit_request
        from dust.services.outfit.daily_service import _cache_key
        request = build_outfit_request({
            'schedule_id': schedule_id, 'title': '아무 제목', 'start': '2026-10-09T09:00:00',
            'city': '서울', 'region': '송파구',
        })
        rule_result = {'outfit': {'band': 'mild'}, 'weather_condition': 'normal', 'must_have': []}
        return _cache_key([(request, {'occasion': occasion})], rule_result)

    def test_key_follows_occasion_not_title(self):
        self.assertEqual(self._key('casual'), self._key('casual'))
        self.assertNotEqual(self._key('casual'), self._key('sport'))

    def _payload(self, title):
        from dust.test_outfit_recommendation import request_payload
        return {'schedules': [{**request_payload('full'), 'title': title}], 'sensitivity': 'normal', 'mode': 'full'}

    @patch('dust.services.outfit.daily_service.save_cached_recommendation')
    @patch('dust.services.outfit.daily_service.get_cached_recommendation', return_value=None)
    @patch('dust.services.outfit.daily_service._llm_allowed', return_value=True)
    @patch('dust.services.outfit.daily_service.build_llm_client')
    @patch('dust.services.outfit.daily_service.load_schedule_snapshot')
    def test_saved_cache_has_no_schedule_titles(self, load_snapshot, build_client, _allowed, _get, save):
        import json
        from unittest.mock import Mock
        from dust.services.outfit.daily_service import recommend_daily_outfit
        from dust.test_outfit_recommendation import snapshot
        load_snapshot.return_value = snapshot(feels_min=10, feels_max=19, feels_avg=15, temp_range=9, rain_prob_max=70, has_rain=True, weather_condition='rain')
        client = Mock()
        client.generate.return_value = {'summary': '우산을 챙기세요.', 'outfit_note': '니트와 청바지를 입어요.', 'layering_tip': '쉽게 벗고 입도록 준비하세요.', 'reasons': {'umbrella': '비에 대비해요'}}
        build_client.return_value = client

        result = recommend_daily_outfit(self._payload('산부인과 진료'), client_key='device')

        self.assertEqual(result['source'], 'llm')
        self.assertEqual(result['schedule_tips'][0]['title'], '산부인과 진료')
        saved = save.call_args.args[1]
        self.assertNotIn('schedule_tips', saved)
        self.assertNotIn('산부인과 진료', json.dumps(saved, ensure_ascii=False))

    @patch('dust.services.outfit.daily_service.get_cached_recommendation', return_value={'source': 'llm', 'summary': 'cached'})
    @patch('dust.services.outfit.daily_service.load_schedule_snapshot')
    def test_cache_hit_uses_current_titles(self, load_snapshot, _get):
        from dust.services.outfit.daily_service import recommend_daily_outfit
        from dust.test_outfit_recommendation import snapshot
        load_snapshot.return_value = snapshot(rain_prob_max=70, has_rain=True, weather_condition='rain')

        result = recommend_daily_outfit(self._payload('바뀐 제목'), client_key='device')

        self.assertTrue(result['cached'])
        self.assertEqual(result['summary'], 'cached')
        self.assertEqual(result['schedule_tips'][0]['title'], '바뀐 제목')


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
