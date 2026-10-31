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

    @patch.object(places, "NAVER_MAP_CLIENT_ID", "map-id")
    @patch.object(places, "NAVER_MAP_CLIENT_SECRET", "map-secret")
    @patch.object(places, "public_api_get")
    def test_address_like_query_uses_geocode(self, api_get):
        api_get.return_value = Mock(status_code=200, json=Mock(return_value={"status": "OK", "addresses": [
            {"roadAddress": "서울특별시 강남구 영동대로 513", "jibunAddress": "서울특별시 강남구 삼성동 159", "x": "127.0594", "y": "37.5116"},
            {"roadAddress": "", "jibunAddress": "", "x": "127", "y": "37"},
        ]}))

        items = places.geocode_address("영동대로 513")

        self.assertEqual(api_get.call_args.args[0], places.NAVER_GEOCODE_URL)
        self.assertEqual(api_get.call_args.kwargs["headers"], {"X-NCP-APIGW-API-KEY-ID": "map-id", "X-NCP-APIGW-API-KEY": "map-secret"})
        self.assertEqual([(item["label"], item["address"], item["lat"], item["lng"]) for item in items], [
            ("서울특별시 강남구 영동대로 513", "서울특별시 강남구 삼성동 159", 37.5116, 127.0594),
        ])

    @patch.object(places, "NAVER_MAP_CLIENT_ID", "map-id")
    @patch.object(places, "NAVER_MAP_CLIENT_SECRET", "map-secret")
    @patch.object(places, "public_api_get")
    def test_place_names_and_missing_secret_skip_geocode(self, api_get):
        self.assertEqual(places.geocode_address("코엑스"), [])
        with patch.object(places, "NAVER_MAP_CLIENT_SECRET", ""):
            self.assertEqual(places.geocode_address("영동대로 513"), [])
        api_get.assert_not_called()

    @patch.dict("os.environ", {"APP_TEST_TOKEN": ""})
    @patch("dust.views.geocode_address", return_value=[{"label": "서울특별시 강남구 영동대로 513", "lat": 37.5, "lng": 127.0}])
    @patch("dust.views.search_naver_places", side_effect=places.PlaceSearchFailed())
    def test_endpoint_puts_addresses_first_and_survives_place_failure(self, _search, _geocode):
        response = self.client.get("/dust/places/naver-search/", {"query": "영동대로 513"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["label"] for item in response.json()["items"]], ["서울특별시 강남구 영동대로 513"])

    @patch.dict("os.environ", {"APP_TEST_TOKEN": ""})
    @patch("dust.views.search_naver_places", return_value=[])
    def test_http_endpoint_caps_requested_size(self, search):
        response = self.client.get("/dust/places/naver-search/", {"query": "은행", "size": "20"})

        self.assertEqual(response.status_code, 200)
        search.assert_called_once_with("은행", 5)
