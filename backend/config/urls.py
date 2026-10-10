"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static


urlpatterns = [
    path('admin/', admin.site.urls),
    path('dust/', include('dust.urls')),
    path('outfit/', include('dust.outfit_urls')),

]

# 선택 기능은 ENABLE_OPTIONAL_FEATURES일 때만 연결한다.
if settings.ENABLE_OPTIONAL_FEATURES:
    urlpatterns.insert(0, path('analyze/', include('analyze.urls')))

# 개발 환경에서 정적 파일 서빙
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
