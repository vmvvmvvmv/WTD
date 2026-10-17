import hmac
import os

from django.http import JsonResponse

from dust.api_errors import error_body


TOKEN_HEADER = "HTTP_X_APP_TEST_TOKEN"
TOKEN_QUERY_PARAM = "app_test_token"


class AppTestTokenMiddleware:
    """Limit temporary app APIs to preview builds that know the shared test token."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        expected_token = os.environ.get("APP_TEST_TOKEN", "").strip()
        protected_path = request.path.startswith("/dust/") or request.path.startswith("/outfit/")
        if not expected_token or not protected_path or request.method == "OPTIONS":
            return self.get_response(request)

        supplied_token = request.META.get(TOKEN_HEADER) or request.GET.get(TOKEN_QUERY_PARAM)
        if not hmac.compare_digest(str(supplied_token or ""), expected_token):
            return JsonResponse(error_body(403, "접근 권한이 없습니다."), status=403)

        return self.get_response(request)
