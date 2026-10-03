from django.urls import path

from .outfit_views import recommend


urlpatterns = [
    path('recommend/', recommend, name='outfit_recommend'),
]
