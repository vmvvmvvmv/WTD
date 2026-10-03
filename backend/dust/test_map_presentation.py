import os

from django.test import SimpleTestCase

from .map_presentation import build_map_css_variables, build_map_ui_config


class MapPresentationTests(SimpleTestCase):
    def test_dust_thresholds_match_korean_air_quality_grades(self):
        config = build_map_ui_config()
        self.assertEqual(config['dust']['thresholds'], [30, 80, 150])
        self.assertEqual(
            [item['label'] for item in config['dust']['legend']],
            ['좋음', '보통', '나쁨', '매우 나쁨', '정보 없음'],
        )

    def test_css_variables_include_unknown_marker_color(self):
        variables = build_map_css_variables()
        self.assertIn('--air-good: #3D7FEA', variables)
        self.assertIn('--unavailable: #A8B2C1', variables)


    def test_mobile_map_response_contains_legend_and_semantic_tokens(self):
        response = self.client.get('/dust/mobile-map/', {'view': 'preview', 'app_test_token': os.environ.get('APP_TEST_TOKEN', '')})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="map-legend"')
        self.assertContains(response, '--air-good: #3D7FEA')
        self.assertContains(response, '정보 없음')
