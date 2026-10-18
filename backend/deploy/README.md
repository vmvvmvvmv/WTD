# 서버 배포 (네이버 클라우드 · Ubuntu)

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

## 1. 네이버 클라우드 콘솔에서 (직접)

무료 조건: Micro 서버는 결제 수단을 등록한 달부터 **1년 무료**(계정당 1대, 한국 리전). **서버 요금만 무료**이고 공인 IP는 따로 과금된다.
1년이 지나면 반납하지 않는 한 **자동으로 유료 전환**되므로 끝나는 날짜를 기록해 둔다.

1. **서버 생성** (Services → Compute → Server, VPC 환경)
   - 서버 이미지: **Ubuntu** (24.04가 없으면 22.04도 됨. 파이썬 3.10 이상이면 Django 5.2 조건 충족)
   - 서버 타입: **Micro** (무료 표시가 있는 것)
   - 스토리지: 기본 디스크 **10GB**(무료 제공량). 추가 디스크는 무료가 아니다
   - 인증키: 새로 만들고 `.pem` 파일을 안전한 곳에 보관 (관리자 비밀번호 확인에 필요)
   - ACG(방화벽): 새로 만든다. 2번에서 규칙을 넣는다
2. **ACG 규칙** (Server → ACG → 규칙 설정, 인바운드)
   - TCP **22**: 접근 소스는 **내 IP만** (예: `내공인IP/32`)
   - TCP **80**, TCP **443**: 접근 소스 `0.0.0.0/0`
3. **공인 IP** (Server → Public IP → 공인 IP 신청 → 만든 서버에 할당)
   - 공인 IP와 **포트 포워딩**을 같이 쓰면 22번 포트를 포트 포워딩이 먼저 가져가서 SSH가 안 된다. 포트 포워딩 설정은 지운다
4. **관리자 비밀번호 확인**: 서버 목록에서 서버 선택 → 서버 관리 및 설정 변경 → **관리자 비밀번호 확인** → `.pem` 파일 올리기
5. **도메인 DNS** (Cloudflare → vmv-lab.com → DNS): A 레코드 `dust` → 공인 IP.
   **프록시(주황 구름)는 끄고 DNS only**로 둔다. 켜 두면 7단계 certbot이 인증서를 못 받는다.
   (`nslookup dust.vmv-lab.com`으로 공인 IP가 나오면 됨)

## 1-1. 첫 접속과 작업 계정 만들기

네이버 클라우드는 `root` 계정과 4번의 비밀번호로 접속한다. 이 문서와 systemd·nginx 설정 파일은 `ubuntu` 계정 기준이라, 처음 한 번 `ubuntu` 계정을 만들고 이후는 그 계정으로 작업한다.

```bash
ssh root@<공인IP>                # 비밀번호: 1단계 4번에서 확인한 값
passwd                           # root 비밀번호를 내 것으로 바꾸기
id ubuntu 2>/dev/null || adduser --gecos "" ubuntu
usermod -aG sudo ubuntu
exit
ssh ubuntu@<공인IP>              # 이후 단계는 모두 ubuntu 계정으로
```

## 2. 서버 기본 패키지

```bash
sudo timedatectl set-timezone Asia/Seoul
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-dev build-essential pkg-config default-libmysqlclient-dev mysql-server nginx certbot python3-certbot-nginx git
```

## 3. 스왑 1GB (Micro는 메모리가 작아서 꼭)

디스크가 10GB라 스왑은 1GB로 한다. 메모리가 모자라면 MySQL이나 pip 설치가 강제로 꺼질 수 있다.

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h && df -h /               # 스왑 1G가 보이고 디스크 여유가 3GB 이상이면 됨
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
