import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { mock } from 'node:test';

const fakeRuntime = `export const API_URL = 'http://api.test'; export const APP_TEST_TOKEN = '';`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '../config/runtime') return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(fakeRuntime)}` };
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.')) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const { getCurrentDust } = await import('./dustEndpoints.ts');

test('응답 본문을 받다가 멈춰도 시간 제한으로 끝난다', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (_url, init) => ({
    ok: true,
    status: 200,
    // 헤더는 왔지만 본문이 끝나지 않는 응답. 요청이 취소될 때만 끝난다.
    json: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
  });
  try {
    const request = getCurrentDust({ city: '부산', region: '대신동' }).then(() => 'resolved', () => 'rejected');
    await new Promise((resolve) => setImmediate(resolve));
    mock.timers.tick(15000);
    const state = await Promise.race([request, new Promise((resolve) => setImmediate(() => resolve('pending')))]);
    assert.equal(state, 'rejected');
  } finally {
    mock.timers.reset();
  }
});
