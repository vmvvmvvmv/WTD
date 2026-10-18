# 서버 배포 (Google Cloud · Ubuntu 24.04)

구성: nginx(HTTPS) → gunicorn(Django) → MySQL, 같은 서버 한 대. 수집 작업은 systemd 타이머로 돌린다.
Docker는 쓰지 않는다. 서버 한 대에 서비스 하나라 systemd로 충분하다.
업체에 묶인 설정은 1단계뿐이다. 다른 클라우드로 옮기면 1단계만 그 업체 방식으로 하면 된다.

```
deploy/
├─ collect_hourly.sh          # 매시 5분 수집 (collect_hourly.bat과 같은 순서)
├─ morning_notifications.sh   # 07:00 아침 알림 + 30일 지난 기록 삭제
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
sudo apt install -y python3-venv python3-dev build-essential pkg-config default-libmysqlclient-dev mysql-server nginx certbot python3-certbot-nginx git
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
sudo systemctl enable --now weathertodo weathertodo-collect.timer weathertodo-morning.timer
systemctl list-timers 'weathertodo*'
```

처음 한 번은 직접 수집해서 DB를 채운다(측정소 위치까지 받아서 몇 분 걸림):
```bash
deploy/collect_hourly.sh
```

## 6-1. 접속 기록 보관 기간 30일 (개인정보 처리방침 3번)

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
| 데이터가 안 바뀜 | `journalctl -u weathertodo-collect -n 100`, `systemctl list-timers` |
| 아침 알림이 안 옴 | `journalctl -u weathertodo-morning -n 50` |
| 지도 아이콘이 안 뜸 | `collectstatic`을 했는지, `/home/ubuntu` 권한 |
