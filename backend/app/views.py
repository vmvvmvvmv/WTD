# Create your views here.
from django import template
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import render, redirect, get_object_or_404
from django.http import HttpResponse, JsonResponse
from datetime import datetime
from .models import Users, Info
import logging
# 추가
from rest_framework.viewsets import ModelViewSet
from .serializers import InfoSerializer

logger = logging.getLogger('custom_logger')

def get_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

def main(request):
    context = {
        'now': datetime.now()
    }
    return render(request, 'main.html', context)

def nid_login(request):
    context = {}
    if request.user.is_authenticated:
        return redirect('/')
    return render(request, 'nidLogin.html', context)

def register(request):
    context = {}
    return render(request, 'nidRegister.html', context)

@login_required(login_url='/nidLogin')
def my_page(request):
    # 현재 로그인한 사용자 가져오기
    user = request.user

    # Users 테이블에서 해당 사용자 객체 가져오기
    user_record = get_object_or_404(Users, user_id=user.user_id)

    # Info 테이블에서 해당 사용자 정보 가져오기
    info_record = get_object_or_404(Info, id=user_record.id)

    user_diseases = info_record.diseases
    user_region = info_record.region
    context = {'diseases': user_diseases, 'region': user_region}
    return render(request, 'mypage.html', context)

@login_required(login_url='/nidLogin')
def update_user_info(request):
    print(request.session.session_key)
    if request.method == 'POST':
        try:
            # 현재 로그인한 사용자 가져오기
            user = request.user

            # Users 테이블에서 해당 사용자 객체 가져오기
            user_record = get_object_or_404(Users, user_id=user.user_id)

            # Info 테이블에서 해당 사용자 정보 가져오기
            info_record = get_object_or_404(Info, id=user_record.id)

            # POST 데이터 가져오기
            user_email = request.data.get('email')
            user_region = request.data.get('region')
            user_disease = request.data.get('disease')
            print(user_email, user_region, user_disease)

            # Users 테이블 업데이트
            if user_email:
                user_record.email = user_email

            # Info 테이블 업데이트
            if user_region:
                info_record.region = user_region
            if user_disease:
                info_record.diseases = user_disease

            # 데이터 저장
            user_record.save()
            info_record.save()

            # 디버그 출력 (필요시)
            # print(f"User: {user_record.user_id}, Email: {user_record.email}")
            # print(f"Info: ID {info_record.id}, Region: {info_record.region}, Disease: {info_record.diseases}")

            return redirect('/mypage')

        except Exception as e:
            # 예외 처리
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    else:
        return JsonResponse({'success': False, 'error': 'Invalid request method'}, status=400)

@login_required(login_url='/nidLogin')
def update_user_password(request):
    try:
        context = {
            'user_id': request.user.user_id,
            'salt': request.user.salt,
        }
        return render(request, 'updatePassword.html', context)
    except Exception as e:
        return render(request, 'nidLogin.html', {})

def login_response(request):
    if request.method == 'POST':
        user_id = request.POST.get('id')
        user_pw = request.POST.get('pw')

        # print(f'id: {user_id}, pw: {user_pw}')

        # 사용자가 입력한 ID에 해당하는 사용자 정보를 DB에서 조회
        try:
            user = Users.objects.get(user_id=user_id)  # Users 모델에서 ID로 검색
        except Users.DoesNotExist:
            # 해당 ID를 가진 사용자가 없다면 로그인 실패 처리
            return JsonResponse({'success': False, 'message': '아이디가 존재하지 않습니다.'})

        # DB에 저장된 비밀번호와 입력된 비밀번호를 비교
        if user_pw == user.password:  # 비밀번호 비교
            login(request, user)

            return JsonResponse({'success': True, 'data': user.nickname})  # 로그인 성공
        else:
            return JsonResponse({'success': False, 'message': '비밀번호가 틀렸습니다.'})  # 비밀번호 오류

    return JsonResponse({'success': False, 'message': '올바른 접근이 아닙니다.'}, status=400)  # POST가 아닐 경우 에러 응답

def log_out(request):
    logout(request)
    return redirect('/')

def register_response(request):
    if request.method == 'POST':
        user_id = request.POST.get('id')
        user_pw = request.POST.get('pw')
        user_email = request.POST.get('email')
        user_nickname = request.POST.get('nickname')
        user_salt = request.POST.get('salt')

        print(f'salt: {user_salt}')

        # 유효성 검사
        if not user_id or not user_pw:
            return JsonResponse({'success': False, 'message': '모든 필드를 입력해야 합니다.'})

        # ID 중복 확인
        if Users.objects.filter(user_id=user_id).exists():
            return JsonResponse({'success': False, 'message': '이미 사용 중인 아이디입니다.'})

        # Email 중복 확인(None이면 패스)
        if user_email and Users.objects.filter(email=user_email).exists():
            return JsonResponse({'success': False, 'message': '이미 사용 중인 이메일입니다.'})

        if not user_salt:
            return JsonResponse({'success': False, 'message': '값이 누락되었습니다.'})

        # 닉네임이 없으면 id로 교체
        if not user_nickname:
            user_nickname = user_id

        # 새로운 사용자 생성 및 저장
        try:
            with transaction.atomic():
                # 새로운 사용자 생성
                new_user = Users(
                    user_id=user_id,
                    password=user_pw,  # 해싱된 비밀번호 저장
                    email=user_email,
                    nickname=user_nickname,
                    salt=user_salt
                )
                new_user.save()

                # Info 생성
                new_info = Info(
                    id=new_user,  # ForeignKey에 Users 인스턴스 할당
                    region=None,
                    diseases=None,
                )
                new_info.save()

            return JsonResponse({'success': True, 'message': '회원가입이 완료되었습니다.'})
        except Exception as e:
            return JsonResponse({'success': False, 'message': '회원가입 중 오류가 발생했습니다.', 'error': str(e)})

    return JsonResponse({'success': False, 'message': '잘못된 요청입니다.'}, status=400)
@login_required(login_url='/nidLogin')
def info_view(request):
    try:
        # 현재 로그인한 사용자의 Users 레코드 가져오기
        user_record = get_object_or_404(Users, user_id=request.user.user_id)
        
        # Users 레코드와 연결된 Info 레코드 가져오기
        info_record = get_object_or_404(Info, id=user_record.id)
        
        # JSON 응답으로 region과 disease 정보 반환
        data = {
            "region": info_record.region,
            "disease": info_record.diseases
        }
        return JsonResponse(data)
    except Exception as e:
        return JsonResponse({
            "error": str(e)
        }, status=500)
# 추가
class InfoViewSet(ModelViewSet):
    queryset = Info.objects.all()
    serializer_class = InfoSerializer