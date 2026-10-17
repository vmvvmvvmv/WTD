import importlib

from django.test import SimpleTestCase, override_settings


class ActiveRoutesTests(SimpleTestCase):
    def test_missing_react_build_is_not_routed_as_a_page(self):
        self.assertEqual(self.client.get('/old-react-route/').status_code, 404)

    def test_login_and_member_routes_are_off(self):
        # 웹 로그인·회원 기능은 2026-10-10에 껐다(코드는 노션 '지운 코드 보관소'와 git 기록에 있음).
        for path in ('/app/', '/app/nidLogin/', '/api/login/', '/api/s/', '/api/register/', '/api/auth/google/login/'):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_admin_is_routed_only_with_optional_features(self):
        # 관리자 로그인 화면은 운영 서버(ENABLE_OPTIONAL_FEATURES=False)에 열지 않는다.
        import config.urls

        def routes():
            return {str(pattern.pattern) for pattern in importlib.reload(config.urls).urlpatterns}

        try:
            with override_settings(ENABLE_OPTIONAL_FEATURES=False):
                self.assertNotIn('admin/', routes())
            with override_settings(ENABLE_OPTIONAL_FEATURES=True):
                self.assertIn('admin/', routes())
        finally:
            importlib.reload(config.urls)
