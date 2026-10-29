# 서버 배포 (Google Cloud · Ubuntu 24.04)

구성: nginx(HTTPS) → gunicorn(Django) → MySQL + Redis, 같은 서버 한 대. 수집 작업은 systemd 타이머로 돌린다.
Docker는 쓰지 않는다. 서버 한 대에 서비스 하나라 systemd로 충분하다.
업체에 묶인 설정은 1단계뿐이다. 다른 클라우드로 옮기면 1단계만 그 업체 방식으로 하면 된다.

```
deploy/
├─ collect_hourly.sh          # 시간마다 수집: dust(매시 25분)·weather(매시 45분) (collect_hourly.bat과 같은 순서)
├─ morning_notifications.sh   # 07:00 아침 알림 + 30일 지난 기록 삭제
├─ mysql/weathertodo.cnf      # MySQL 느린 쿼리 기록 설정
├─ redis/weathertodo.conf     # Redis 캐시 메모리 제한 설정
├─ systemd/                   # gunicorn 서비스, 수집·알림 타이머
└─ nginx/weathertodo.conf     # dust.vmv-lab.com → gunicorn 소켓
```

## 1. Google Cloud 콘솔에서 (직접)

무료 조건: 신규 가입 크레딧 **$300, 90일**. 서버·공인 IP·디스크·트래픽 모두 크레딧에서 빠진다.
체험 중에는 자동 결제되지 않고, 90일이 지나면 서버가 멈춘다. **끝나는 날짜를 기록**해 두고 그 전에 유료 전환이나 이전을 정한다.

0. **SSH 키 만들기** (내 PC, PowerShell)
   ```bash
   ssh-keygen -t ed25519 -C ubuntu -f $HOME/.ssh/wtd_gcp
   cat $HOME/.ssh/wtd_gcp.pub      # 이 한 줄을 3번에 붙여 넣는다
   ```
   끝의 `ubuntu`가 서버 계정 이름이 된다. systemd·nginx 설정이 `ubuntu` 기준이라 바꾸지 않는다.
1. **프로젝트 만들기** → Compute Engine 메뉴에 들어가 API 사용 설정
2. **VM 만들기** (Compute Engine → VM 인스턴스 → 인스턴스 만들기)
   - 리전: **asia-northeast3 (서울)**, 영역은 아무거나
   - 머신: **e2-small** (vCPU 2, 메모리 2GB)
   - 부팅 디스크: **Ubuntu 24.04 LTS (x86/64)**, 균형 있는 영구 디스크 **20GB**
   - 방화벽: **HTTP 트래픽 허용**, **HTTPS 트래픽 허용** 체크
   - 네트워킹 → 네트워크 인터페이스 → 외부 IPv4 주소: **고정 외부 IP 주소 예약** (임시 IP는 껐다 켜면 바뀜)
3. **SSH 키 등록**: 만들기 화면 보안 → 액세스 관리 → **항목 추가** → 0번의 `.pub` 한 줄 붙여 넣기
4. **SSH 포트 좁히기** (VPC 네트워크 → 방화벽 → `default-allow-ssh` 수정)
   - 소스 IPv4 범위: `0.0.0.0/0` → **`내공인IP/32`**
   - 이렇게 하면 콘솔의 "브라우저에서 SSH" 버튼은 안 된다. 내 PC 터미널로 접속한다
5. **예산 알림** (결제 → 예산 및 알림): 월 **$30**, 50%·90%·100%에서 메일
6. **도메인 DNS** (Cloudflare → vmv-lab.com → DNS): A 레코드 `dust` → 2번의 고정 IP.
   **프록시(주황 구름)는 끄고 DNS only**로 둔다. 켜 두면 7단계 certbot이 인증서를 못 받는다.
   (`nslookup dust.vmv-lab.com`으로 고정 IP가 나오면 됨)

## 1-1. 첫 접속

3번에서 넣은 키로 `ubuntu` 계정이 sudo 권한과 함께 만들어진다. 이후 단계는 모두 이 계정으로 한다.

```bash
ssh -i $HOME/.ssh/wtd_gcp ubuntu@<고정IP>
```

## 2. 서버 기본 패키지

```bash
sudo timedatectl set-timezone Asia/Seoul
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-dev build-essential pkg-config default-libmysqlclient-dev mysql-server redis-server nginx certbot python3-certbot-nginx git
sudo systemctl enable --now redis-server
redis-cli ping   # PONG이면 됨
```

## 3. 스왑 1GB

메모리 2GB에 MySQL·gunicorn·pip 설치가 겹치면 빠듯할 수 있어 여유분으로 둔다.

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h && df -h /               # 스왑 1G가 보이면 됨
```

## 4. MySQL

```bash
sudo mysql
```
```sql
CREATE DATABASE weathertodo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'weathertodo_user'@'localhost' IDENTIFIED BY '여기에-긴-비밀번호';
GRANT ALL PRIVILEGES ON weathertodo.* TO 'weathertodo_user'@'localhost';
FLUSH PRIVILEGES;
```

## 5. 코드와 환경변수

```bash
cd ~ && git clone https://github.com/vmvvmvvmv/WTD.git && cd WTD/backend
python3 -m venv venv && venv/bin/pip install --upgrade pip && venv/bin/pip install -r requirements.txt
cp .env.example .env && nano .env
```

`.env`에서 꼭 바꿀 값:
- `DJANGO_SECRET_KEY`: `venv/bin/python -c "import secrets; print(secrets.token_urlsafe(50))"`로 만든 값
- `DB_PASS`: 4번에서 정한 비밀번호
- `REDIS_URL`: 기본값은 `redis://127.0.0.1:6379/0`임. Redis를 쓰지 않을 때는 비워 두면 로컬 메모리 캐시로 동작함
- `PUBLIC_DATA_API_KEY`, `KMA_API_KEY`, `NAVER_*`, `LLM_API_KEY`: 로컬 `.env`의 값
- `APP_TEST_TOKEN`: 앱 빌드에 넣을 값과 같게
- `TRUSTED_PROXY_COUNT=1` (nginx 뒤라서. 0이면 AI 하루 제한을 모든 사용자가 나눠 씀)
- `PRIVACY_CONTACT`: 개인정보 처리방침(`/privacy/`)에 보일 문의처(공개해도 되는 이메일)

```bash
chmod 600 .env
venv/bin/python manage.py migrate
venv/bin/python manage.py collectstatic --noinput
venv/bin/python manage.py check --deploy
chmod +x deploy/*.sh
```

## 6. gunicorn과 수집 타이머

```bash
sudo cp deploy/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
# 예전 매시 5분 타이머를 쓰던 서버라면 먼저 끈다: sudo systemctl disable --now weathertodo-collect.timer
sudo systemctl enable --now weathertodo weathertodo-collect-dust.timer weathertodo-collect-weather.timer weathertodo-morning.timer
systemctl list-timers 'weathertodo*'
```

## 6-1. Redis 캐시 메모리 제한

Redis는 캐시 전용이라 메모리가 계속 늘지 않도록 128MB로 제한한다. 공간이 부족하면 오래 사용하지 않은 캐시부터 지운다. Redis에 세션이나 영구 데이터를 넣을 때는 이 설정을 그대로 쓰면 안 된다.

```bash
sudo redis-cli CONFIG SET maxmemory 128mb
sudo redis-cli CONFIG SET maxmemory-policy allkeys-lru
sudo redis-cli CONFIG REWRITE
redis-cli CONFIG GET maxmemory maxmemory-policy
```

출력에 `134217728`과 `allkeys-lru`가 보이면 됨. 설정을 두 번 붙이지 않도록 재적용할 때는 기존 WeatherToDo 블록을 먼저 지운다.

## 6-2. MySQL 느린 쿼리 기록

인덱스를 바로 추가하지 않고 실제로 0.5초 넘게 걸리는 쿼리를 먼저 확인한다. 로그가 쌓인 뒤 `mysqldumpslow`와 쿼리의 `EXPLAIN` 결과를 보고 인덱스나 코드 수정을 결정한다.

```bash
sudo cp deploy/mysql/weathertodo.cnf /etc/mysql/mysql.conf.d/weathertodo.cnf
sudo systemctl restart mysql
sudo mysql -e "SHOW VARIABLES LIKE 'slow_query%'; SHOW VARIABLES LIKE 'long_query_time';"
sudo tail -f /var/log/mysql/weathertodo-slow.log
```

로그 파일이 생기지 않으면 `/var/log/mysql` 권한과 `sudo journalctl -u mysql -n 50`을 확인한다. `log_queries_not_using_indexes`는 로그가 폭증할 수 있어 기본으로 끄고, 필요한 경우에만 임시로 켠다.

처음 한 번은 직접 수집해서 DB를 채운다(측정소 위치까지 받아서 몇 분 걸림):
```bash
deploy/collect_hourly.sh
```
공휴일(올해·내년)도 처음 한 번 받는다. 이후에는 아침 7시 타이머가 매일 다시 받는다(공공데이터포털에서 `한국천문연구원_특일 정보` 활용 신청 필요):
```bash
venv/bin/python manage.py collect_holidays
```

## 6-3. 접속 기록 보관 기간 30일 (개인정보 처리방침 3번)

gunicorn 접속 기록은 systemd 저널에 남는다. 30일이 지나면 지우게 한다.
nginx 접속 기록은 Ubuntu 기본 logrotate가 14일 뒤 지운다.

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nMaxRetentionSec=30day\n' | sudo tee /etc/systemd/journald.conf.d/retention.conf
sudo systemctl restart systemd-journald
```

## 7. nginx와 HTTPS

```bash
sudo cp deploy/nginx/weathertodo.conf /etc/nginx/sites-available/weathertodo
sudo ln -s /etc/nginx/sites-available/weathertodo /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d dust.vmv-lab.com
```

nginx가 `/home/ubuntu` 아래 정적 파일을 읽을 수 있어야 한다: `chmod 755 /home/ubuntu`

## 7-1. 보안 다듬기

nginx 버전 숨김, IP당 요청 제한(초당 10번), IP로 직접 들어오는 스캐너 차단. certbot이 고친 사이트 설정과 따로 둔다.

```bash
sudo cp deploy/nginx/hardening.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

서버 기본값 확인(모두 Ubuntu 기본값이 맞으면 손댈 것 없음):
```bash
sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin)'   # no, without-password 또는 no
systemctl is-enabled unattended-upgrades                              # enabled (보안 업데이트 자동 설치)
sudo ss -tlnp | grep -E ':3306|:33060'                                # 127.0.0.1만 보여야 함(MySQL 외부 차단)
```

## 8. 확인

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://dust.vmv-lab.com/dust/current/   # APP_TEST_TOKEN을 켰으면 403이 정상
curl -s -H "X-App-Test-Token: <토큰>" "https://dust.vmv-lab.com/dust/current/?city=서울&region=송파구" | head -c 300
curl -s -o /dev/null -w "%{http_code}\n" https://dust.vmv-lab.com/admin/          # 404여야 함(관리자 페이지 닫힘)
curl -s -o /dev/null -w "%{http_code}\n" https://dust.vmv-lab.com/privacy/        # 200이어야 함(개인정보 처리방침, 토큰 없이 공개)
```

### 네이버 지역 검색 API HUB

일정 지도 검색은 서버에서 네이버 지역 검색 API를 호출한다. 새 NAVER API HUB 앱을 등록하고 지역 검색 권한을 켠 뒤 서버 환경 변수 `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`을 설정한다. 값은 앱 빌드 변수에 넣지 않는다. 서버를 재시작하면 새 API HUB 주소와 인증 헤더를 사용한다. 두 값이 없으면 기존 `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET` 방식으로 동작한다.

앱(홈·지도·일정 지도 선택)은 친 검색어를 그대로 보내고, 서버는 네이버 지역 검색 결과를 제공 순서대로 최대 5개 돌려준다. 지역 검색 API는 지도 중심 좌표를 받지 않아 거리순 정렬은 하지 않는다. API HUB의 요금과 호출 한도를 콘솔에서 확인한다.

### 네이버 지도 주소 검색(Geocoding)

검색어가 주소처럼 보이면(숫자가 있거나 '~로·~길·~동' 등) 네이버 지도 주소 검색 결과를 최대 2개 앞에 붙인다. NCP 콘솔 → Maps → Application에서 지도 앱의 **Geocoding**을 켜고, 그 앱의 Client Secret을 서버 `.env`의 `NAVER_MAP_CLIENT_SECRET`에 넣는다(Client ID는 기존 `NAVER_MAP_CLIENT_ID`). 비워 두면 주소 검색만 건너뛴다. 호출 한도·요금은 콘솔에서 확인한다.

## 9. 앱이 이 서버를 보게 하기

EAS 대시보드 → 프로젝트 → Environment variables의 `preview`·`production`에:
- `EXPO_PUBLIC_API_URL` = `https://dust.vmv-lab.com`
- `EXPO_PUBLIC_APP_TEST_TOKEN` = 서버 `.env`의 `APP_TEST_TOKEN`과 같은 값
- `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID` = 네이버 지도 키

그다음 `eas build -p android --profile preview`로 APK를 만든다.
네이버 지도 콘솔의 웹 서비스 URL에 `https://dust.vmv-lab.com`을 추가해야 지도가 뜬다.
Play Console에 올릴 때 개인정보처리방침 URL은 `https://dust.vmv-lab.com/privacy/`를 넣는다.

## 업데이트할 때

```bash
cd ~/WTD && git pull
cd backend && venv/bin/pip install -r requirements.txt
venv/bin/python manage.py migrate && venv/bin/python manage.py collectstatic --noinput
sudo systemctl restart weathertodo
```

## 문제가 생기면

| 증상 | 볼 곳 |
|---|---|
| 502 Bad Gateway | `sudo journalctl -u weathertodo -n 50` (gunicorn이 안 떴음. 대개 `.env` 값 문제) |
| 데이터가 안 바뀜 | `journalctl -u 'weathertodo-collect@*' -n 100`, `systemctl list-timers` |
| 아침 알림이 안 옴 | `journalctl -u weathertodo-morning -n 50` |
| 지도 아이콘이 안 뜸 | `collectstatic`을 했는지, `/home/ubuntu` 권한 |
