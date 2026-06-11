"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static

import analyze.views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('analyze/', include('analyze.urls')),
    path('app/', include('app.urls')),
    path('dust/', include('dust.urls')),

    # React SPA: /api, /admin, /analyze, /app, /dust, /media 이외의 모든 경로를
    # React build/index.html로 처리 (React Router가 클라이언트 라우팅 담당)
    re_path(r'^(?!api/|admin/|analyze/|app/|dust/|media/).*$',
            TemplateView.as_view(template_name='index.html'),
            name='react-app'),
]

# 개발 환경에서 정적 파일 서빙
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
