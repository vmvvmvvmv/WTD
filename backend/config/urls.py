"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static


urlpatterns = [
    path('dust/', include('dust.urls')),
    path('outfit/', include('dust.outfit_urls')),

]

# 선택 기능과 관리자 페이지는 ENABLE_OPTIONAL_FEATURES일 때만 연결한다(운영 서버에 로그인 화면을 열어 두지 않음).
if settings.ENABLE_OPTIONAL_FEATURES:
    urlpatterns.insert(0, path('analyze/', include('analyze.urls')))
    urlpatterns.insert(0, path('admin/', admin.site.urls))

# 개발 환경에서 정적 파일 서빙
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
