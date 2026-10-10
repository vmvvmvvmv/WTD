from django.test import SimpleTestCase


class InfoApiExposureTests(SimpleTestCase):
    def test_info_list_is_not_publicly_routed(self):
        # 질환·지역 정보는 로그인 사용자 본인만 /api/mypage/ 로 조회해야 한다.
        response = self.client.get('/app/app/Info/')
        self.assertEqual(response.status_code, 404)

    def test_info_detail_cannot_be_deleted_anonymously(self):
        response = self.client.delete('/app/app/Info/1/')
        self.assertEqual(response.status_code, 404)


class ClientPasswordMatchTests(SimpleTestCase):
    def test_empty_stored_password_never_matches(self):
        from app.models import Users
        social_user = Users(user_id='google_abc', password='', salt='')
        self.assertFalse(social_user.matches_client_password(''))
        self.assertFalse(social_user.matches_client_password(None))

    def test_matching_and_non_ascii_input(self):
        from app.models import Users
        user = Users(user_id='tester', password='abc123', salt='s')
        self.assertTrue(user.matches_client_password('abc123'))
        self.assertFalse(user.matches_client_password('abc124'))
        self.assertFalse(user.matches_client_password('비밀번호'))
