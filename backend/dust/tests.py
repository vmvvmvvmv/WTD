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
