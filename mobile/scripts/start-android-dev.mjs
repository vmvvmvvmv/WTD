import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const adbFromSdk = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe')
  : '';
const adb = adbFromSdk && existsSync(adbFromSdk) ? adbFromSdk : 'adb';

const state = spawnSync(adb, ['get-state'], { encoding: 'utf8' });
if (state.status !== 0 || !state.stdout.includes('device')) {
  console.error('Android 기기를 찾지 못했습니다. USB 디버깅 연결과 adb devices 상태를 확인하세요.');
  process.exit(1);
}

for (const port of ['8081', '8001']) {
  const result = spawnSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('ADB reverse 연결 완료: Metro 8081, Django 8001');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const expo = spawn(npx, ['expo', 'start', '--dev-client', '--localhost', '--clear', '--port', '8081'], {
  stdio: 'inherit',
});

expo.on('exit', (code) => process.exit(code ?? 0));
