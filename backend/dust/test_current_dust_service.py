import unittest

from .current_dust_service import canonical_sido_name, select_current_dust


class CurrentDustServiceUnitTests(unittest.TestCase):
    def test_full_city_name_is_normalized_for_station_lookup(self):
        self.assertEqual(canonical_sido_name('부산광역시'), '부산')
        self.assertEqual(canonical_sido_name('서울특별시'), '서울')
        self.assertEqual(canonical_sido_name('강원특별자치도'), '강원')

    def test_realtime_is_preferred(self):
        payload, status = select_current_dust(
            '부산', '대신동', '대신동',
            {'pm10': '22', 'name': '대신동'},
            {'pm10': '35', 'name': '대신동'},
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload['basis'], 'realtime_current')
        self.assertEqual(payload['item']['pm10Value'], '22')

    def test_daily_fallback(self):
        payload, status = select_current_dust('부산', '대신동', '대신동', None, {'pm10': '35'})
        self.assertEqual(status, 200)
        self.assertEqual(payload['basis'], 'past_latest')

    def test_no_measurement(self):
        payload, status = select_current_dust('부산', '대신동', '대신동', None, None)
        self.assertEqual(status, 404)
        self.assertIsNone(payload['item'])

    def test_zero_is_a_valid_measurement(self):
        payload, status = select_current_dust('부산', '대신동', '대신동', {'pm10': 0}, None)
        self.assertEqual(status, 200)
        self.assertEqual(payload['item']['pm10Value'], 0)


if __name__ == '__main__':
    unittest.main()
