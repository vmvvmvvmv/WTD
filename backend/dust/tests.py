from unittest.mock import patch

from django.test import SimpleTestCase

class CurrentDustEndpointTests(SimpleTestCase):
    @patch('dust.views._resolve_station_name', return_value='대신동')
    @patch('dust.views._load_realtime_station_values', return_value=({}, {}))
    @patch('dust.views._load_latest_daily_station_values', return_value={})
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
                patch(f'{module}.weather_risk_for_region', return_value=object()), \
                patch(f'{module}.DustNotificationLog.objects.filter') as logs, \
                patch(f'{module}.events_for_date', return_value=[]), \
                patch(f'{module}.build_weather_morning_body', return_value='body'), \
                patch(f'{module}.send_expo_push', side_effect=ExpoDeviceNotRegistered('gone')):
            logs.return_value.exists.return_value = False
            result = send_weather_morning_notifications(date(2026, 10, 9))
        self.assertEqual(result.failed, 1)
        self.assertFalse(device.enabled)
        self.assertEqual(device.calendar_events, [])
        device.save.assert_called_once()


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
