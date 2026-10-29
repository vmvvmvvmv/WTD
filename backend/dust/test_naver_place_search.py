from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from dust.services import places


class NaverPlaceSearchTests(SimpleTestCase):
    @patch.object(places, "NAVER_API_HUB_CLIENT_ID", "hub-id")
    @patch.object(places, "NAVER_API_HUB_CLIENT_SECRET", "hub-secret")
    @patch.object(places, "public_api_get")
    def test_hub_search_caps_size_and_keeps_result_order_and_links(self, api_get):
        api_get.return_value = Mock(status_code=200, json=Mock(return_value={"items": [
            {"title": "첫 장소", "mapx": "1270000000", "mapy": "375000000", "link": "https://example.com/first"},
            {"title": "둘째 장소", "mapx": "1280000000", "mapy": "355000000", "link": "https://example.com/second"},
        ]}))

        items = places.search_naver_places("서울 은행", 20)

        self.assertEqual(api_get.call_args.args[0], places.NAVER_API_HUB_LOCAL_SEARCH_URL)
        self.assertEqual(api_get.call_args.kwargs["params"], {"query": "서울 은행", "display": 5})
        self.assertEqual(api_get.call_args.kwargs["headers"], {
            "X-NCP-APIGW-API-KEY-ID": "hub-id", "X-NCP-APIGW-API-KEY": "hub-secret",
        })
        self.assertEqual([(item["label"], item["link"]) for item in items], [
            ("첫 장소", "https://example.com/first"),
            ("둘째 장소", "https://example.com/second"),
        ])

    @patch.object(places, "NAVER_API_HUB_CLIENT_ID", "")
    @patch.object(places, "NAVER_API_HUB_CLIENT_SECRET", "")
    @patch.object(places, "NAVER_SEARCH_CLIENT_ID", "legacy-id")
    @patch.object(places, "NAVER_SEARCH_CLIENT_SECRET", "legacy-secret")
    @patch.object(places, "public_api_get")
    def test_legacy_search_remains_available(self, api_get):
        api_get.return_value = Mock(status_code=200, json=Mock(return_value={"items": []}))

        self.assertEqual(places.search_naver_places("은행", 1), [])
        self.assertEqual(api_get.call_args.args[0], places.NAVER_LOCAL_SEARCH_URL)
        self.assertEqual(api_get.call_args.kwargs["headers"], {
            "X-Naver-Client-Id": "legacy-id", "X-Naver-Client-Secret": "legacy-secret",
        })

    @patch.dict("os.environ", {"APP_TEST_TOKEN": ""})
    @patch("dust.views.search_naver_places", return_value=[])
    def test_http_endpoint_caps_requested_size(self, search):
        response = self.client.get("/dust/places/naver-search/", {"query": "은행", "size": "20"})

        self.assertEqual(response.status_code, 200)
        search.assert_called_once_with("은행", 5)
