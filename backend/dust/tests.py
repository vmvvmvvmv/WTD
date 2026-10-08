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
