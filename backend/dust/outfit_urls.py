from django.urls import path

from .outfit_views import recommend, recommend_daily


urlpatterns = [
    path('recommend/', recommend, name='outfit_recommend'),
    path('daily/', recommend_daily, name='outfit_daily'),
]
