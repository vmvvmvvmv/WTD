import unittest

from .current_dust_service import select_current_dust


class CurrentDustServiceUnitTests(unittest.TestCase):
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
