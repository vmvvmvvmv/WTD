# 서버 배포 (AWS Lightsail · Ubuntu 24.04)

구성: nginx(HTTPS) → gunicorn(Django) → MySQL, 같은 서버 한 대. 수집 작업은 systemd 타이머로 돌린다.
Docker는 쓰지 않는다. 서버 한 대에 서비스 하나라 systemd로 충분하다.

```
deploy/
├─ collect_hourly.sh          # 매시 5분 수집 (collect_hourly.bat과 같은 순서)
├─ morning_notifications.sh   # 07:00 아침 알림
├─ systemd/                   # gunicorn 서비스, 수집·알림 타이머
└─ nginx/weathertodo.conf     # dust.vmv-lab.com → gunicorn 소켓
```

## 1. Lightsail에서 (콘솔, 직접)

1. 인스턴스 만들기: Linux/Unix → OS only → **Ubuntu 24.04 LTS**, 서울 리전.
   요금제는 메모리 **2GB 이상**을 권한다(MySQL + gunicorn 2개 + scikit-learn). 1GB면 아래 3번의 스왑을 꼭 만든다.
2. 고정 IP(Static IP)를 만들어 인스턴스에 붙인다.
3. 네트워킹 → 방화벽: **HTTP 80, HTTPS 443** 열기 (SSH 22는 기본으로 열려 있음).
4. 도메인 DNS에 A 레코드 추가: `dust` → 고정 IP. (`dig dust.vmv-lab.com`으로 IP가 나오면 됨)

## 2. 서버 기본 패키지

```bash
sudo timedatectl set-timezone Asia/Seoul
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-dev build-essential pkg-config default-libmysqlclient-dev mysql-server nginx certbot python3-certbot-nginx git
```

## 3. (메모리 1GB일 때만) 스왑 2GB

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
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
```

## 9. 앱이 이 서버를 보게 하기

EAS 대시보드 → 프로젝트 → Environment variables의 `preview`·`production`에:
- `EXPO_PUBLIC_API_URL` = `https://dust.vmv-lab.com`
- `EXPO_PUBLIC_APP_TEST_TOKEN` = 서버 `.env`의 `APP_TEST_TOKEN`과 같은 값
- `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID` = 네이버 지도 키

그다음 `eas build -p android --profile preview`로 APK를 만든다.
네이버 지도 콘솔의 웹 서비스 URL에 `https://dust.vmv-lab.com`을 추가해야 지도가 뜬다.

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
