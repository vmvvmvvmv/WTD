"""포트폴리오에 적은 응답 시간을 다시 재는 스크립트.

로컬 서버(start_local_backend.bat)를 켠 상태에서 backend 폴더에서 실행한다.
    venv\\Scripts\\python tools\\measure_latency.py outfit
    venv\\Scripts\\python tools\\measure_latency.py home

토큰은 .env에서 읽어 요청 헤더에만 쓰고 출력하거나 결과 파일에 남기지 않는다.
결과(원본 측정값 전부)는 tools/results/ 에 JSON으로 저장한다.
"""
import json
import os
import platform
import random
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django  # noqa: E402

django.setup()

BASE = os.getenv("WTD_BENCH_BASE", "http://127.0.0.1:8001")
TOKEN = os.getenv("APP_TEST_TOKEN", "")


def call(path, params=None, body=None):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method="POST" if body is not None else "GET")
    req.add_header("X-App-Test-Token", TOKEN)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=40) as res:
            payload, code = res.read(), res.status
    except urllib.error.HTTPError as err:
        payload, code = err.read(), err.code
    return code, (time.perf_counter() - start) * 1000, payload


def summary(values):
    return {"n": len(values), "median_ms": round(statistics.median(values), 1), "min_ms": round(min(values), 1), "max_ms": round(max(values), 1)}


def environment():
    return {
        "measured_at": datetime.now().isoformat(timespec="seconds"),
        "server": BASE + " (Django runserver, 같은 PC)",
        "os": platform.platform(),
        "cpu": platform.processor(),
        "python": platform.python_version(),
        "note": "PC 안에서 잰 서버 응답 시간. 폰 통신·화면 그리기 시간은 포함 안 됨.",
    }


def measure_outfit(sensitivity):
    # 같은 일정을 규칙만(rule) → AI 설명까지(full) → 한 번 더(full, 저장된 결과) 순서로 요청한다.
    base = {"schedule_id": "bench", "title": "친구와 카페", "activity_type": "outdoor", "lat": 35.10, "lng": 129.03, "city": "부산", "region": "대신동", "sensitivity": sensitivity}
    slots = [(1, 9), (1, 11), (1, 19), (2, 9), (2, 12), (2, 15), (2, 18), (3, 10), (3, 14), (3, 18)]  # (며칠 뒤, 시작 시)
    rows = []
    for days, hour in slots:
        day = datetime.now() + timedelta(days=days)
        start = f"{day:%Y-%m-%d}T{hour:02d}:00:00+09:00"
        end = f"{day:%Y-%m-%d}T{hour + 2:02d}:00:00+09:00"
        body = {**base, "start": start, "end": end}
        c1, rule_ms, _ = call("/outfit/recommend/", body={**body, "mode": "rule"})
        c2, full_ms, p2 = call("/outfit/recommend/", body={**body, "mode": "full"})
        c3, again_ms, p3 = call("/outfit/recommend/", body={**body, "mode": "full"})
        first, second = json.loads(p2) if c2 == 200 else {}, json.loads(p3) if c3 == 200 else {}
        rows.append({"start": start, "status": [c1, c2, c3], "rule_ms": rule_ms, "full_first_ms": full_ms, "full_first_source": first.get("source"), "full_first_cached": bool(first.get("cached")), "full_again_ms": again_ms, "full_again_cached": bool(second.get("cached"))})
    # AI가 실제로 쓰였고(처음엔 저장값이 아님) 두 번째는 저장값인 경우만 센다.
    valid = [r for r in rows if r["status"] == [200, 200, 200] and r["full_first_source"] == "llm" and not r["full_first_cached"] and r["full_again_cached"]]
    return {
        "condition": f"같은 일정 {len(rows)}개, 민감도 {sensitivity}. 처음 full 요청이 AI(llm)이고 저장값이 아닌 경우만 셈",
        "valid_samples": len(valid),
        "rule": summary([r["rule_ms"] for r in valid]),
        "full_first": summary([r["full_first_ms"] for r in valid]),
        "full_again": summary([r["full_again_ms"] for r in valid]),
        "raw": rows,
    }


def dashboard_calls(city, region, today):
    q = {"city": city, "region": region}
    return [
        ("/dust/predict/", q),
        ("/dust/past/", {**q, "startDate": (today - timedelta(days=7)).strftime("%Y%m%d"), "endDate": today.strftime("%Y%m%d")}),
        ("/dust/current/", q),
        ("/dust/hourly/", {**q, "date": today.strftime("%Y%m%d")}),
    ]


def measure_home(seeds, per_group):
    # 앱 홈이 보내는 미세먼지 요청 4개를 하나씩 vs 동시에 보낸다.
    # 서버가 한 번 본 지역은 저장해 두므로, 두 방식에 서로 다른 '처음 보는 지역'을 쓴다.
    code, _, payload = call("/dust/korea-stations/")
    items = json.loads(payload)["items"]
    regions = sorted({(it.get("sido"), it.get("city") or it.get("name")) for it in items if it.get("sido") and (it.get("city") or it.get("name"))})
    today = datetime.now()
    rounds = []
    for seed in seeds:
        random.Random(seed).shuffle(regions)
        group_parallel, group_sequential = regions[:per_group], regions[per_group:per_group * 2]
        parallel, sequential = [], []
        for city, region in group_parallel:
            calls = dashboard_calls(city, region, today)
            start = time.perf_counter()
            with ThreadPoolExecutor(4) as pool:
                list(pool.map(lambda pq: call(*pq), calls))
            parallel.append((time.perf_counter() - start) * 1000)
        for city, region in group_sequential:
            start = time.perf_counter()
            for path, params in dashboard_calls(city, region, today):
                call(path, params)
            sequential.append((time.perf_counter() - start) * 1000)
        rounds.append({"seed": seed, "parallel": summary(parallel), "sequential": summary(sequential), "parallel_raw_ms": parallel, "sequential_raw_ms": sequential, "parallel_regions": group_parallel, "sequential_regions": group_sequential})
        regions = regions[per_group * 2:] + regions[:per_group * 2]  # 다음 회차는 안 쓴 지역부터
    p = statistics.median([r["parallel"]["median_ms"] for r in rounds])
    s = statistics.median([r["sequential"]["median_ms"] for r in rounds])
    return {
        "condition": f"처음 보는 지역 {per_group}곳씩, {len(seeds)}회. 요청 4개 = 예측·최근 7일·지금 값·시간별 미세먼지",
        "sequential_median_of_medians_ms": round(s, 1),
        "parallel_median_of_medians_ms": round(p, 1),
        "improvement_percent": round((s - p) / s * 100, 1),
        "rounds": rounds,
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    mode = sys.argv[1] if len(sys.argv) > 1 else "home"
    result = {"environment": environment()}
    if mode == "outfit":
        result["outfit"] = measure_outfit(sys.argv[2] if len(sys.argv) > 2 else "cold")
        o = result["outfit"]
        print(f"[옷차림] 유효 {o['valid_samples']}개 | 규칙 {o['rule']['median_ms']}ms | AI 처음 {o['full_first']['median_ms']}ms | AI 두번째 {o['full_again']['median_ms']}ms")
    else:
        result["home"] = measure_home(seeds=[11, 22, 33], per_group=12)
        h = result["home"]
        for r in h["rounds"]:
            print(f"[홈] seed {r['seed']} | 하나씩 {r['sequential']['median_ms']}ms | 동시에 {r['parallel']['median_ms']}ms")
        print(f"[홈] 하나씩 {h['sequential_median_of_medians_ms']}ms → 동시에 {h['parallel_median_of_medians_ms']}ms ({h['improvement_percent']}% 단축)")
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"latency-{mode}-{datetime.now():%Y%m%d-%H%M}.json")
    with open(out, "w", encoding="utf-8") as fp:
        json.dump(result, fp, ensure_ascii=False, indent=2)
    print("저장:", os.path.relpath(out))
