from django.test import SimpleTestCase


class ActiveRoutesTests(SimpleTestCase):
    def test_missing_react_build_is_not_routed_as_a_page(self):
        self.assertEqual(self.client.get('/old-react-route/').status_code, 404)

    def test_login_and_member_routes_are_off(self):
        # 웹 로그인·회원 기능은 2026-10-10에 껐다(코드는 노션 '지운 코드 보관소'와 git 기록에 있음).
        for path in ('/app/', '/app/nidLogin/', '/api/login/', '/api/s/', '/api/register/', '/api/auth/google/login/'):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_admin_login_page_still_works(self):
        # 관리자 페이지는 app.Users 모델로 로그인하므로 그대로 남는다.
        self.assertEqual(self.client.get('/admin/login/').status_code, 200)
