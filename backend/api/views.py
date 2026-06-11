import os
import secrets
from urllib.parse import urlencode

from django.contrib.auth import login, logout
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404, redirect
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.middleware.csrf import get_token

from .serializers import UserSerializer
from rest_framework.decorators import api_view
from .models import Users, Info, AccessHistory
from rest_framework.response import Response
from .code import HistoryCode, HttpStatusCode
import hashlib
import requests
from .util import color

ADDRESS_FILE_PATH = './addr.json' # 관측소 정보를 날려줄 json파일
MAX_PROFILE_IMAGE_SIZE = 3 * 1024 * 1024

def read_address_info():
    with open(ADDRESS_FILE_PATH, 'r', encoding='utf-8') as f:
        from rest_framework.utils import json
        address_info = json.loads(f.read())
        return address_info

def get_profile_image_url(request, info_record):
    profile_image = getattr(info_record, 'profile_image', None)
    if profile_image:
        try:
            return request.build_absolute_uri(profile_image.url)
        except ValueError:
            return ''
    return ''

@api_view(['POST'])
def get_salt(request):
    user_id = request.data.get('id')
    try:
        user = Users.objects.get(user_id=user_id)
        return JsonResponse({'success': True, 'salt': user.salt}, status=HttpStatusCode.OK)
    except Users.DoesNotExist:
        return JsonResponse({'success': False, 'message': '올바른 정보가 아닙니다.'}, status=HttpStatusCode.BAD_REQUEST)

@api_view(['POST'])
def do_login(request):
    print(color(f'login -> request.COOKIES: [yellow]{request.COOKIES}[/yellow]'))
    # user_id = request.GET.get('id')
    user_id = request.data.get('id')
    # user_pw = request.GET.get('pw')
    user_pw = request.data.get('pw')
    # 테스트용 SHA256코드

    # 사용자가 입력한 ID에 해당하는 사용자 정보를 DB에서 조회
    try:
        # Users 테이블에서 해당 사용자 객체 가져오기
        user_record = get_object_or_404(Users, user_id=user_id)

        # Info 테이블에서 해당 사용자 정보 가져오기
        info_record = get_object_or_404(Info, id=user_record.id)

        user_data = {
            'user_id': user_record.user_id,
            'email': user_record.email,
            'nickname': user_record.nickname,
            'salt': user_record.salt,
            'region': info_record.region,
            'diseases': info_record.diseases,
            'profile_image_url': get_profile_image_url(request, info_record),
        }

        # user = Users.objects.get(user_id=user_id)  # Users 모델에서 ID로 검색
        # serialized_user = UserSerializer(instance=user)
    except Users.DoesNotExist:
        # 해당 ID를 가진 사용자가 없다면 로그인 실패 처리
        create_history(request, user_id, HistoryCode.FAIL)
        return JsonResponse({'success': False, 'message': '오류가 발생했습니다.'}, status=HttpStatusCode.BAD_REQUEST)

    # DB에 저장된 비밀번호와 입력된 비밀번호를 비교
    if user_pw == user_record.password:  # 비밀번호 비교
        login(request, user_record)
        # print(request.session.session_key)
        create_history(request, user_id, HistoryCode.SUCCESS)
        data = user_data | {'session_id': request.session.session_key} | {'csrftoken': get_token(request)}
        print(color(f'[red][LOGIN][/red] userId: [red]{user_id}[/red]'))
        return JsonResponse({'success': True, 'data': data}, status=HttpStatusCode.OK)  # 로그인 성공
    else:
        create_history(request, user_id, HistoryCode.FAIL)
        return JsonResponse({'success': False, 'message': '계정이 존재하지않습니다.'}, status=HttpStatusCode.BAD_REQUEST)  # 비밀번호 오류

@api_view(['POST'])
def do_logout(request):
    print(color(f'logout -> request.COOKIES: [yellow]{request.COOKIES}[/yellow]'))
    if request.user.is_authenticated:
        print(color(f'[red][LOGOUT][/red] userId: [red]{request.user.user_id}[/red]'))
        logout(request)
    return JsonResponse({'success': True, 'data': {'csrftoken': get_token(request)}}, status=HttpStatusCode.OK)

@api_view(['POST'])
def check_login(request):
    print(color(f'check_login -> request.COOKIES: [yellow]{request.COOKIES}[/yellow]'))
    if request.user.is_authenticated:
        try:
            info_record = Info.objects.get(id=request.user.id)
            data = {
                'user_id': request.user.user_id,
                'email': request.user.email,
                'nickname': request.user.nickname,
                'region': info_record.region,
                'diseases': info_record.diseases,
                'profile_image_url': get_profile_image_url(request, info_record),
                'salt': request.user.salt,
                'session_id': request.session.session_key,
                'csrftoken': get_token(request),
            }
        except Info.DoesNotExist:
            data = {
                'user_id': request.user.user_id,
                'email': request.user.email,
                'nickname': request.user.nickname,
                'region': '서울 송파구',
                'diseases': '',
                'profile_image_url': '',
                'salt': request.user.salt,
                'session_id': request.session.session_key,
                'csrftoken': get_token(request),
            }
        return JsonResponse({'success': True, 'data': data}, status=HttpStatusCode.OK)
    return JsonResponse({'success': False, 'message': '로그인 된 상태가 아닙니다.', 'c': get_token(request)}, status=HttpStatusCode.UNAUTHORIZED)

def google_login(request):
    client_id = os.environ.get('GOOGLE_CLIENT_ID')
    redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI') or request.build_absolute_uri('/api/auth/google/callback/')
    if not client_id:
        return JsonResponse({'success': False, 'message': 'GOOGLE_CLIENT_ID가 설정되지 않았습니다.'}, status=HttpStatusCode.INTERNAL_SERVER_ERROR)

    state = secrets.token_urlsafe(24)
    request.session['google_oauth_state'] = state
    params = {
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': 'openid email profile',
        'state': state,
        'access_type': 'online',
        'prompt': 'select_account',
    }
    return redirect(f'https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}')

def google_callback(request):
    state = request.GET.get('state')
    code = request.GET.get('code')
    saved_state = request.session.pop('google_oauth_state', None)
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')

    if not code or not state or state != saved_state:
        return redirect(f'{frontend_url}/main?sso=google&status=failed')

    client_id = os.environ.get('GOOGLE_CLIENT_ID')
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET')
    redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI') or request.build_absolute_uri('/api/auth/google/callback/')
    if not client_id or not client_secret:
        return redirect(f'{frontend_url}/main?sso=google&status=missing_config')

    try:
        token_response = requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': redirect_uri,
                'grant_type': 'authorization_code',
            },
            timeout=10,
        )
        token_response.raise_for_status()
        access_token = token_response.json().get('access_token')
        if not access_token:
            return redirect(f'{frontend_url}/main?sso=google&status=failed')

        profile_response = requests.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10,
        )
        profile_response.raise_for_status()
        profile = profile_response.json()
    except requests.RequestException:
        return redirect(f'{frontend_url}/main?sso=google&status=failed')

    google_sub = profile.get('sub')
    email = profile.get('email') or ''
    nickname = (profile.get('name') or email.split('@')[0] or 'Google 사용자')[:20]
    if not google_sub:
        return redirect(f'{frontend_url}/main?sso=google&status=failed')

    user_id = f"google_{hashlib.sha256(google_sub.encode()).hexdigest()[:9]}"
    try:
        with transaction.atomic():
            user, created = Users.objects.get_or_create(
                user_id=user_id,
                defaults={
                    'password': '',
                    'email': email[:40],
                    'nickname': nickname,
                    'salt': '',
                },
            )
            if not created:
                changed = False
                if email and user.email != email[:40]:
                    user.email = email[:40]
                    changed = True
                if nickname and user.nickname != nickname:
                    user.nickname = nickname
                    changed = True
                if changed:
                    user.save()

            Info.objects.get_or_create(
                id=user,
                defaults={
                    'region': '서울 송파구',
                    'diseases': None,
                },
            )
    except Exception:
        return redirect(f'{frontend_url}/main?sso=google&status=failed')

    login(request, user)
    create_history(request, user.user_id, HistoryCode.SUCCESS)
    return redirect(f'{frontend_url}/main?sso=google&status=success')

@api_view(['POST'])
def do_register(request):
    if request.method == 'POST':
        user_id = request.data.get('id')
        user_pw = request.data.get('pw')
        user_email = request.data.get('email')
        user_nickname = request.data.get('nickname')
        user_salt = request.data.get('salt')
        user_region = request.data.get('region') or '서울 송파구'

        # 유효성 검사
        if not user_id or not user_pw:
            return JsonResponse({'success': False, 'message': '모든 필드를 입력해야 합니다.'}, status=HttpStatusCode.BAD_REQUEST)

        # ID 중복 확인
        if Users.objects.filter(user_id=user_id).exists():
            return JsonResponse({'success': False, 'message': '이미 사용 중인 아이디입니다.'}, status=HttpStatusCode.BAD_REQUEST)

        # Email 중복 확인(None이면 패스)
        if user_email and Users.objects.filter(email=user_email).exists():
            return JsonResponse({'success': False, 'message': '이미 사용 중인 이메일입니다.'}, status=HttpStatusCode.BAD_REQUEST)

        if not user_salt:
            return JsonResponse({'success': False, 'message': '값이 누락되었습니다.'}, status=HttpStatusCode.BAD_REQUEST)

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
                    region=user_region,
                    diseases=None,
                )
                new_info.save()

            create_history(request, user_id, HistoryCode.REGISTRATION)
            print(color(f'[red][REGISTER][/red] userId: [red]{user_id}[/red]'))

            return JsonResponse({'success': True, 'message': '회원가입이 완료되었습니다.'}, status=HttpStatusCode.CREATED)
        except Exception as e:
            return JsonResponse({'success': False, 'message': '회원가입 중 오류가 발생했습니다.'}, status=HttpStatusCode.BAD_REQUEST)

    return JsonResponse({'success': False, 'message': '잘못된 요청입니다.'}, status=HttpStatusCode.BAD_REQUEST)

@api_view(['POST'])
def update_user_info(request):
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'message': '잘못된 요청입니다.'}, status=HttpStatusCode.FORBIDDEN)
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
            user_disease = request.data.get('diseases')
            user_nickname = request.data.get('nickname')
            user_profile_image = request.FILES.get('profile_image')
            if user_profile_image:
                if user_profile_image.size > MAX_PROFILE_IMAGE_SIZE:
                    return JsonResponse({'success': False, 'message': '프로필 이미지는 3MB 이하만 업로드할 수 있습니다.'}, status=HttpStatusCode.BAD_REQUEST)
                if not (user_profile_image.content_type or '').startswith('image/'):
                    return JsonResponse({'success': False, 'message': '이미지 파일만 업로드할 수 있습니다.'}, status=HttpStatusCode.BAD_REQUEST)
            if not user_nickname:
                user_nickname = user.user_id

            # Users 테이블 업데이트
            if user_email:
                user_record.email = user_email
            if user_nickname:
                user_record.nickname = user_nickname

            # Info 테이블 업데이트
            if user_region:
                from django.core.cache import cache
                # 기존 지역 캐시 삭제
                old_parts = info_record.region.split(' ') if info_record.region else []
                if len(old_parts) == 2:
                    cache.delete(f'dust_{old_parts[0]}_{old_parts[1]}')
                # 새 지역 캐시도 삭제
                new_parts = user_region.split(' ')
                if len(new_parts) == 2:
                    cache.delete(f'dust_{new_parts[0]}_{new_parts[1]}')
                info_record.region = user_region
                        # if user_disease:
            info_record.diseases = user_disease
            if user_profile_image:
                if info_record.profile_image:
                    info_record.profile_image.delete(save=False)
                info_record.profile_image = user_profile_image

            # 데이터 저장
            user_record.save()
            info_record.save()

            # 디버그 출력 (필요시)
            # print(f"User: {user_record.user_id}, Email: {user_record.email}")
            # print(f"Info: ID {info_record.id}, Region: {info_record.region}, Disease: {info_record.diseases}")

            create_history(request, user.user_id, HistoryCode.UPDATE_INFO)

            print(color(f'[red][UPDATE-INFO][/red] userId: [red]{user_record.user_id}[/red]'))



            return JsonResponse({'success': True}, status=HttpStatusCode.OK)

        except Exception as e:
            # 예외 처리
            return JsonResponse({'success': False, 'message': '알 수 없는 오류가 발생하였습니다.'}, status=HttpStatusCode.INTERNAL_SERVER_ERROR)
    else:
        return JsonResponse({'success': False, 'message': 'Invalid request method'}, status=HttpStatusCode.METHOD_NOT_ALLOWED)

@api_view(['POST'])
def update_password(request):
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'message': '잘못된 요청입니다.'}, status=HttpStatusCode.FORBIDDEN)
    try:
        user = request.user
        user_record = get_object_or_404(Users, user_id=user.user_id)
        # 데이터 가져오기
        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')
        new_salt = request.data.get('new_salt')

        if user_record.password == current_password:
            user_record.password = new_password
            user_record.salt = new_salt
        else:
            return JsonResponse({'success': False, 'message': '현재 비밀번호가 일치하지않습니다.'}, status=HttpStatusCode.NOT_FOUND)

        user_record.save()
        create_history(request, user.user_id, HistoryCode.UPDATE_PASSWORD)
        data = {
            'session_id': request.session.session_key,
            'csrftoken': get_token(request),
        }
        print(color(f'[red][UPDATE-PASS][/red] userId: [red]{user_record.user_id}[/red]'))
        return JsonResponse({'success': True, 'data': data}, status=HttpStatusCode.OK)

    except Exception as e:
        return JsonResponse({'success': False, 'message': '예상치 못한 오류가 발생하였습니다.'}, status=HttpStatusCode.INTERNAL_SERVER_ERROR)

@api_view(['POST'])
def get_user_data(request):
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'message': '잘못된 요청입니다.'}, status=HttpStatusCode.FORBIDDEN)
    if request.method == 'POST':
        try:
            # 현재 로그인한 사용자 가져오기
            user = request.user

            # Users 테이블에서 해당 사용자 객체 가져오기
            user_record = get_object_or_404(Users, user_id=user.user_id)

            # Info 테이블에서 해당 사용자 정보 가져오기
            info_record = get_object_or_404(Info, id=user_record.id)

            response_json = {
                'user_id': user_record.user_id,
                'nickname': user_record.nickname,
                'email': user_record.email,
                'region': info_record.region,
                'diseases': info_record.diseases,
                'profile_image_url': get_profile_image_url(request, info_record),
            }

            # 디버그 출력 (필요시)
            # print(f"User: {user_record.user_id}, Email: {user_record.email}")
            # print(f"Info: ID {info_record.id}, Region: {info_record.region}, Disease: {info_record.diseases}")

            return JsonResponse({'success': True, 'data': response_json}, status=HttpStatusCode.OK)

        except Exception as e:
            print(color(f'[red]{e}[/red]'))
            # 예외 처리
            return JsonResponse({'success': False, 'message': '알 수 없는 오류가 발생하였습니다.'}, status=HttpStatusCode.INTERNAL_SERVER_ERROR)
    else:
        return JsonResponse({'success': False, 'message': 'Invalid request method'}, status=HttpStatusCode.METHOD_NOT_ALLOWED)

@api_view(['POST'])
def get_access_history(request):
    if request.user.is_authenticated:
        # user_id에 맞는 모든 AccessHistory 레코드를 가져옵니다.
        access_history = AccessHistory.objects.filter(user_id=request.user.user_id)

        # 결과를 data 객체에 담기
        data = []
        for record in access_history:
            data.append({
                'access_time': record.access_time,
                'access_ip': record.access_ip,
                'result': record.result,
            })

        return JsonResponse({'success': True, 'data': data}, status=HttpStatusCode.OK)
    else:
        return JsonResponse({'success': False, 'message': '올바른 접근이 아닙니다.'}, status=HttpStatusCode.UNAUTHORIZED)

@api_view(['GET'])
def get_address_info(request):
    try:
        info = read_address_info()
        return JsonResponse({'success': True, 'data': info})
    except Exception as e:
        return JsonResponse({'success': False, 'msg': f'오류가 발생했습니다. {e}'})

def pbkdf2(password):
    salt = os.urandom(16)

    hashed_password = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode(),
        salt,
        100000
    )

    return salt, hashed_password

def get_current_time():
    from django.utils import timezone
    return timezone.now()

def create_history(request, user_id, code):
    with transaction.atomic():
        new_access_history = AccessHistory(
            user_id=user_id,
            access_time=get_current_time(),
            access_ip=get_ip_addr(request),
            result=code,
        )

        new_access_history.save()
    return None

def get_ip_addr(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        # 'X-Forwarded-For' 헤더는 여러 개의 IP가 쉼표로 구분될 수 있으므로 첫 번째 IP를 사용합니다.
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip
