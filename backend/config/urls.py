"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('app/', include('app.urls')),
    path('dust/', include('dust.urls')),
    path('outfit/', include('dust.outfit_urls')),

    # React SPA: /api, /admin, /analyze, /app, /dust, /media 이외의 모든 경로를
    # React build/index.html로 처리 (React Router가 클라이언트 라우팅 담당)
    re_path(r'^(?!api/|admin/|analyze/|app/|dust/|media/).*$',
            TemplateView.as_view(template_name='index.html'),
            name='react-app'),
]

# 선택 기능은 ENABLE_OPTIONAL_FEATURES일 때만 연결한다. (SPA catch-all보다 앞에 둔다)
if settings.ENABLE_OPTIONAL_FEATURES:
    urlpatterns.insert(0, path('analyze/', include('analyze.urls')))

# 개발 환경에서 정적 파일 서빙
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
