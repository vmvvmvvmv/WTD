from django.urls import path
from . import views

app_name = 'common'

urlpatterns = [
    # 일반 HTML 뷰 경로
    path('', views.main, name='main'),
    path('nidLogin/', views.nid_login, name='nid_login'),
    path('nidRegister/', views.register, name='nid_register'),
    path('login/', views.login_response, name='login'),
    path('register/', views.register_response, name='register'),
    path('logout/', views.log_out, name='log_out'),
    path('mypage/', views.my_page, name='my_page'),
    path('update/', views.update_user_info, name='update'),
    path('updatePassword/', views.update_user_password, name='update_password'),
    path('info/', views.info_view, name='info_view'),
]