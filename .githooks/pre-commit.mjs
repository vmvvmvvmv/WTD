// 커밋 전 검사 (Codex·Claude·사람 공통). 활성화: git config core.hooksPath .githooks
// 1) 비밀 파일이 커밋에 들어가는지  2) 추가된 줄에 키·토큰이 섞였는지  3) 모바일 TS 변경 시 타입 검사
// 급할 때 우회: git commit --no-verify (권장하지 않음)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean);
if (staged.length === 0) process.exit(0);

const problems = [];

// 1) 올리면 안 되는 파일
const forbiddenFile = /(^|\/)(\.env(\.(?!example$|sample$|template$)[\w.-]+)?|google-services\.json|GoogleService-Info\.plist|[^/]+\.(keystore|jks|p12|pem|key))$/;
for (const file of staged) {
  if (forbiddenFile.test(file)) problems.push(`비밀 파일: ${file}`);
}

// 2) 추가된 줄의 키 모양 문자열 + 로컬 .env에 들어 있는 실제 비밀 값
const secretPatterns = [
  ['OpenAI 키', /sk-(proj-)?[A-Za-z0-9_-]{20,}/],
  ['Anthropic 키', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['Google API 키', /AIza[0-9A-Za-z_-]{35}/],
  ['AWS 액세스 키', /AKIA[0-9A-Z]{16}/],
  ['GitHub 토큰', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['Slack 토큰', /xox[abprs]-[A-Za-z0-9-]{10,}/],
  ['개인 키', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

// .env 값은 이 스크립트 안에서만 비교하고 출력하지 않는다(변수 이름만 알린다).
const envSecrets = [];
for (const envPath of ['backend/.env', 'mobile/.env', '.env']) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASS)[A-Z0-9_]*)\s*=\s*["']?(.+?)["']?\s*$/);
    if (match && match[3].length >= 12) envSecrets.push([`${envPath}의 ${match[1]} 값`, match[3]]);
  }
}

let currentFile = '';
for (const line of git('diff', '--cached', '-U0', '--diff-filter=ACMR', '--no-color').split('\n')) {
  if (line.startsWith('+++ b/')) currentFile = line.slice(6);
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(line)) problems.push(`${label} 모양 문자열: ${currentFile}`);
  }
  for (const [label, value] of envSecrets) {
    if (line.includes(value)) problems.push(`${label}이 들어 있음: ${currentFile}`);
  }
}

if (problems.length > 0) {
  console.error('\n[pre-commit] 커밋을 막았습니다. 비밀 정보가 섞였을 수 있습니다.');
  for (const problem of [...new Set(problems)]) console.error(`  - ${problem}`);
  console.error('  해당 파일을 git restore --staged <파일> 로 빼거나 내용을 고친 뒤 다시 커밋하세요.\n');
  process.exit(1);
}

// 3) 모바일 TypeScript 변경 시 타입 검사
if (staged.some((file) => /^mobile\/.*\.(ts|tsx)$/.test(file))) {
  console.error('[pre-commit] 모바일 타입 검사(tsc) 실행 중...');
  const result = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: 'mobile', shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('\n[pre-commit] 타입 오류가 있어 커밋을 막았습니다. 위 오류를 고친 뒤 다시 커밋하세요.\n');
    process.exit(1);
  }
}
