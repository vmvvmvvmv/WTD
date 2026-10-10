from django.test import SimpleTestCase


class ActiveRoutesTests(SimpleTestCase):
    def test_missing_react_build_is_not_routed_as_a_page(self):
        self.assertEqual(self.client.get('/old-react-route/').status_code, 404)

    def test_existing_app_page_keeps_its_template(self):
        response = self.client.get('/app/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'main.html')
