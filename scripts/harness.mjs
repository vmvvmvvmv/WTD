#!/usr/bin/env node
/**
 * WeatherToDo (WTD) 학습 · 개선 · 통합 검증 하네스
 *
 * 사용법:
 *   node scripts/harness.mjs check                 # 모바일 + 백엔드 전체 검증
 *   node scripts/harness.mjs mobile                # 모바일 typecheck + lint + test
 *   node scripts/harness.mjs backend [테스트...]   # 백엔드 Django check + test
 *   node scripts/harness.mjs bench                 # 모바일 검증 소요 시간 측정
 *   node scripts/harness.mjs study                 # 코드베이스 학습용 아키텍처 맵 출력
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const MOBILE_DIR = path.join(ROOT_DIR, 'mobile');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');

const args = process.argv.slice(2);
const command = args[0] || 'check';
const extraArgs = args.slice(1);

function runStep(label, cmd, cmdArgs, cwd) {
  const startedAt = performance.now();
  console.log(`\n▶ [${label}] 실행: ${cmd} ${cmdArgs.join(' ')}`);
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const ok = result.status === 0;
  console.log(`${ok ? '✔' : '✖'} [${label}] ${ok ? '성공' : `실패 (exit=${result.status})`} (${elapsedMs}ms)`);
  return { label, ok, elapsedMs, status: result.status ?? 1 };
}

function resolveBackendPython() {
  const candidates = process.platform === 'win32'
    ? [
        path.join(BACKEND_DIR, 'venv', 'Scripts', 'python.exe'),
        'python',
        'py',
      ]
    : [
        path.join(BACKEND_DIR, 'venv', 'bin', 'python'),
        'python3',
        'python',
      ];

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) continue;
    const probeArgs = candidate === 'py' ? ['-3', '--version'] : ['--version'];
    const probe = spawnSync(candidate, probeArgs, {
      cwd: BACKEND_DIR,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (probe.status === 0) {
      return candidate === 'py' ? { cmd: 'py', prefix: ['-3'] } : { cmd: candidate, prefix: [] };
    }
  }
  return null;
}

function runMobileChecks() {
  const results = [];
  results.push(runStep('Mobile TypeCheck', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], MOBILE_DIR));
  results.push(runStep('Mobile ESLint', 'npx', ['eslint', 'src/', '--quiet'], MOBILE_DIR));
  results.push(runStep('Mobile Unit Tests', 'npm', ['test'], MOBILE_DIR));
  return results;
}

function runBackendChecks(testTargets = []) {
  const py = resolveBackendPython();
  if (!py) {
    console.error('\n✖ [Backend] 실행 가능한 Python 인터프리터를 찾지 못했습니다.');
    console.error('  backend/venv가 유효한지 확인하거나 Python 3.11+ 환경을 PATH에 등록하세요.');
    return [{ label: 'Backend Python Check', ok: false, elapsedMs: 0, status: 1 }];
  }

  const results = [];
  results.push(runStep('Django System Check', py.cmd, [...py.prefix, 'manage.py', 'check'], BACKEND_DIR));

  const testArgs = [...py.prefix, 'manage.py', 'test', '--noinput', '-v', '1', ...testTargets];
  results.push(runStep('Django Unit Tests', py.cmd, testArgs, BACKEND_DIR));
  return results;
}

function printSummary(results) {
  console.log('\n================ 하네스 실행 요약 ================');
  let allOk = true;
  let totalMs = 0;
  for (const r of results) {
    totalMs += r.elapsedMs;
    if (!r.ok) allOk = false;
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(24)} ${String(r.elapsedMs).padStart(6)}ms`);
  }
  console.log(`--------------------------------------------------`);
  console.log(`  총 소요 시간: ${totalMs}ms | 최종 결과: ${allOk ? '성공' : '실패'}`);
  console.log('==================================================\n');
  return allOk;
}

function walkFiles(dir, predicate, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'venv' || entry.name === '__pycache__' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, predicate, acc);
    else if (predicate(fullPath)) acc.push(fullPath);
  }
  return acc;
}

function printProjectFacts() {
  const mobileSrcDir = path.join(MOBILE_DIR, 'src');
  const mobileTsFiles = walkFiles(mobileSrcDir, (f) => /\.(ts|tsx)$/.test(f));
  const mobileTestFiles = walkFiles(mobileSrcDir, (f) => /\.test\.mjs$/.test(f));

  const backendDustDir = path.join(BACKEND_DIR, 'dust');
  const backendPyFiles = walkFiles(backendDustDir, (f) => /\.py$/.test(f) && !f.includes(`${path.sep}migrations${path.sep}`));
  const backendTestFiles = walkFiles(backendDustDir, (f) => path.basename(f).startsWith('test') && f.endsWith('.py'));

  const modelsContent = readFileSync(path.join(backendDustDir, 'models.py'), 'utf8');
  const modelNames = [...modelsContent.matchAll(/^class\s+(\w+)\(models\.Model\):/gm)].map((m) => m[1]);

  let hooksPath = '(미설정)';
  try {
    hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: ROOT_DIR, encoding: 'utf8' }).trim() || '(미설정)';
  } catch {
    hooksPath = '(미설정)';
  }

  console.log(`
================ WeatherToDo (WTD) 코드베이스 최신 팩트 ================
[모바일 (mobile/src)]
  - TypeScript 소스 파일 수: ${mobileTsFiles.length}개
  - 단위 테스트 파일 수:     ${mobileTestFiles.length}개

[백엔드 (backend/dust)]
  - Python 모듈 수(마이그레이션 제외): ${backendPyFiles.length}개
  - 테스트 파일 수:                    ${backendTestFiles.length}개
  - Django 모델 수 (${modelNames.length}개): ${modelNames.join(', ')}

[품질 자동화]
  - Git hooksPath: ${hooksPath}
  - 통합 하네스:   scripts/harness.mjs (check | mobile | backend | bench | study | facts)
==========================================================================
`);
}

function printStudyMap() {
  console.log(`
================ WeatherToDo (WTD) 학습 아키텍처 맵 ================

1. 전체 구조
   [Mobile (Expo / RN / TS)] ──HTTP(JSON)──▶ [Backend (Django / DRF)]
                                                  ├── MySQL (운영) / SQLite :memory: (테스트)
                                                  ├── Redis / FileCache / LocMemCache (테스트)
                                                  ├── 외부 API: 기상청, 에어코리아, 네이버 검색, Gemini
                                                  └── 주기 수집: backend/dust/management/commands/*

2. 백엔드 핵심 학습 순서 (backend/)
   ① config/settings.py & config/urls.py
      - 환경별 DB/캐시 분기(테스트 시 SQLite 메모리 + LocMemCache 자동 전환)
      - AppTestTokenMiddleware (dust/test_access.py)
   ② dust/models.py
      - AirQualityStation, RealtimeDustMeasurement, WeatherHourlyMeasurement,
        WeatherMidTermForecast, HourlyDustPrediction, NotificationDevice
   ③ dust/urls.py & dust/views.py & dust/memo_views.py
      - 화면용 API 엔드포인트 진입점 (/dust/*, /outfit/*)
   ④ dust/services/
      - weather.py, stations.py, dust_history.py, places.py
      - memo_events.py (Gemini 기반 자연어 일정 파싱)
      - outfit/ (rule_engine.py, occasion.py, context_builder.py, service.py)
   ⑤ dust/ml/hourly_pm10.py & management/commands/
      - 시간별 미세먼지 예측, 데이터 수집, 푸시 알림 발송 배치

3. 모바일 핵심 학습 순서 (mobile/src/)
   ① app/AppContent.tsx & navigation/routes.ts
      - 탭 구조(홈, 캘린더, 지도, 설정)와 전역 훅 조립
   ② api/dustEndpoints.ts & config/runtime.ts
      - 타임아웃(15s/25s), X-App-Test-Token 헤더, 엔드포인트 호출부
   ③ features/
      - dashboard/ (홈 대시보드, 외출 최적 시간 bestOutingWindow.ts)
      - calendar/ (반복 일정 calendarRepeat.ts, 일정별 위험도 calendarRiskEvaluator.ts)
      - outfit/ (옷차림 캐시 및 기상 알림)
      - region/ & places/ (지역·장소 검색 및 오타 교정 typoCorrect.ts)
   ④ notifications/ & widget/ & modules/exact-alarm/
      - 로컬/푸시 알림 동기화, Android 홈 위젯, 정확한 알람 네이티브 모듈

4. 자주 쓰는 검증 명령어
   - 전체 검증:        node scripts/harness.mjs check
   - 모바일만 검증:    node scripts/harness.mjs mobile
   - 백엔드 특정 테스트: node scripts/harness.mjs backend dust.test_outfit_recommendation
   - 성능 기준 측정:   node scripts/harness.mjs bench
======================================================================
`);
}

switch (command) {
  case 'check':
  case 'all': {
    const mobileResults = runMobileChecks();
    const backendResults = runBackendChecks(extraArgs);
    const ok = printSummary([...mobileResults, ...backendResults]);
    process.exit(ok ? 0 : 1);
  }
  case 'mobile': {
    const ok = printSummary(runMobileChecks());
    process.exit(ok ? 0 : 1);
  }
  case 'backend': {
    const ok = printSummary(runBackendChecks(extraArgs));
    process.exit(ok ? 0 : 1);
  }
  case 'bench': {
    console.log('▶ [Bench] 모바일 검증 성능 측정(개선 전/후 비교용)');
    const ok = printSummary(runMobileChecks());
    process.exit(ok ? 0 : 1);
  }
  case 'study':
  case 'map': {
    printStudyMap();
    process.exit(0);
  }
  case 'facts': {
    printProjectFacts();
    process.exit(0);
  }
  default: {
    console.error(`알 수 없는 명령: ${command}`);
    console.error('사용 가능: check | mobile | backend | bench | study | facts');
    process.exit(1);
  }
}
