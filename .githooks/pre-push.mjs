// 푸시 전 전체 검증 하네스 실행. 활성화: git config core.hooksPath .githooks
// 급할 때 우회: git push --no-verify (권장하지 않음)
import { spawnSync } from 'node:child_process';

console.error('[pre-push] 전체 검증 하네스(scripts/harness.mjs check) 실행 중...');
const result = spawnSync('node', ['scripts/harness.mjs', 'check'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  console.error('\n[pre-push] 검증이 실패하여 푸시를 막았습니다. 오류를 수정한 뒤 다시 푸시하세요.');
  console.error('  (긴급 우회: git push --no-verify)\n');
  process.exit(result.status ?? 1);
}
