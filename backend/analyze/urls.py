from django.urls import path
from .views import *

app_name = 'analyze'

urlpatterns = [
    path('compact/<str:pm>&<str:dis>', compact, name='ai_short'),  
    path('complex/<str:pm>&<str:dis>', complex, name='long'),
]