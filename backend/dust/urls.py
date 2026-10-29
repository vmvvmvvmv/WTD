from django.conf import settings
from django.urls import path
from .memo_views import memo_events
from .views import current_dust, current_weather, holidays, hourly_dust, hourly_weather, korea_station_dust, midterm_weather, mobile_map, mobile_map_client_log, naver_place_search, predict_dust, past_dust, past_weather, register_notification_device

urlpatterns = [
    path('predict/', predict_dust, name='predict_dust'),
    path('past/', past_dust, name='past_dust'),
    path('hourly/', hourly_dust, name='hourly_dust'),
    path('current/', current_dust, name='current_dust'),
    path('weather/current/', current_weather, name='current_weather'),
    path('weather/hourly/', hourly_weather, name='hourly_weather'),
    path('weather/mid-term/', midterm_weather, name='midterm_weather'),
    path('korea-stations/', korea_station_dust, name='korea_station_dust'),
    path('mobile-map/', mobile_map, name='mobile_map'),
    path('mobile-map/log/', mobile_map_client_log, name='mobile_map_client_log'),
    path('places/naver-search/', naver_place_search, name='naver_place_search'),
    path('notifications/register/', register_notification_device, name='register_notification_device'),
    path('calendar/memo-events/', memo_events, name='memo_events'),
    path('calendar/holidays/', holidays, name='holidays'),
]

# 앱에서 쓰지 않는 선택 기능(기상 상세 데이터)은 운영 서버에 노출하지 않는다.
if settings.ENABLE_OPTIONAL_FEATURES:
    urlpatterns += [
        path('weather/past/', past_weather, name='past_weather'),
    ]
