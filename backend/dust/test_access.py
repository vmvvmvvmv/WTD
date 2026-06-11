import os

from django.http import JsonResponse


TOKEN_HEADER = "HTTP_X_APP_TEST_TOKEN"
TOKEN_QUERY_PARAM = "app_test_token"


class AppTestTokenMiddleware:
    """Limit temporary app APIs to preview builds that know the shared test token."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        expected_token = os.environ.get("APP_TEST_TOKEN", "").strip()
        if not expected_token or not request.path.startswith("/dust/") or request.method == "OPTIONS":
            return self.get_response(request)

        supplied_token = request.META.get(TOKEN_HEADER) or request.GET.get(TOKEN_QUERY_PARAM)
        if supplied_token != expected_token:
            return JsonResponse({"detail": "Forbidden"}, status=403)

        return self.get_response(request)
