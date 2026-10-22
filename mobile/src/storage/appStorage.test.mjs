import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// 앱 저장소가 쓰는 expo 모듈을 메모리 가짜로 바꿔 끼웁니다.
globalThis.__files = new Map();
globalThis.__secure = new Map();
const fakeFileSystem = `
const files = globalThis.__files;
export const documentDirectory = 'file:///app/';
export async function getInfoAsync(path) { return { exists: files.has(path) || [...files.keys()].some((key) => key.startsWith(path + '/')) }; }
export async function makeDirectoryAsync() {}
export async function readAsStringAsync(path) { if (!files.has(path)) throw new Error('missing ' + path); return files.get(path); }
export async function writeAsStringAsync(path, value) { await new Promise((resolve) => setTimeout(resolve, Math.random() * 5)); files.set(path, value); }
export async function deleteAsync(path) { files.delete(path); }
export async function moveAsync({ from, to }) { if (files.has(to)) throw new Error('exists'); files.set(to, files.get(from)); files.delete(from); }
`;
const fakeSecureStore = `
const store = globalThis.__secure;
export async function getItemAsync(key) { return store.has(key) ? store.get(key) : null; }
export async function setItemAsync(key, value) { if (value.length > 2048) throw new Error('too large'); store.set(key, value); }
export async function deleteItemAsync(key) { store.delete(key); }
`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-file-system/legacy') return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(fakeFileSystem)}` };
    if (specifier === 'expo-secure-store') return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(fakeSecureStore)}` };
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.')) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const storage = await import('./appStorage.ts');
const eventsFile = 'file:///app/app-storage/dust.calendar-events.json';
const event = (id) => ({ activityType: 'outdoor', date: '2026-10-11', id, sensitive: false, time: '10:00', title: `일정 ${id}` });

test('예전 SecureStore 일정을 처음 읽을 때 파일로 옮기고, 옮긴 뒤에 지운다', async () => {
  globalThis.__secure.set('dust.calendar-events', JSON.stringify([event('a')]));
  const state = await storage.loadStoredAppState();
  assert.deepEqual(state.calendarEvents.map((item) => item.id), ['a']);
  assert.ok(globalThis.__files.has(eventsFile));
  assert.equal(globalThis.__secure.has('dust.calendar-events'), false);
});

test('2KB가 넘는 일정도 저장되고, 빠르게 여러 번 저장하면 마지막 값이 남는다', async () => {
  const many = Array.from({ length: 60 }, (_, index) => event(`e${index}`));
  assert.ok(JSON.stringify(many).length > 2048);
  await Promise.all([storage.saveCalendarEvents([event('old')]), storage.saveCalendarEvents(many)]);
  const state = await storage.loadStoredAppState();
  assert.equal(state.calendarEvents.length, 60);
});

test('바꿔 끼우는 도중 꺼져 임시 파일만 남아도 값을 되살린다', async () => {
  globalThis.__files.delete(eventsFile);
  globalThis.__files.set(`${eventsFile}.tmp`, JSON.stringify([event('tmp')]));
  const state = await storage.loadStoredAppState();
  assert.deepEqual(state.calendarEvents.map((item) => item.id), ['tmp']);
});

test('튜토리얼은 처음 설치한 사람에게만 띄우고, 다 보면 다시 띄우지 않는다', async () => {
  globalThis.__files.clear();
  globalThis.__secure.clear();
  assert.equal((await storage.loadStoredAppState()).tutorialSeen, false);

  // 튜토리얼 중간에 앱을 꺼도(그 사이 지역은 자동 저장됨) 다음 실행 때 다시 띄운다.
  await storage.saveSelectedRegion({ city: '서울', region: '종로구' });
  assert.equal((await storage.loadStoredAppState()).tutorialSeen, false);

  await storage.saveTutorialSeen();
  assert.equal((await storage.loadStoredAppState()).tutorialSeen, true);

  // 튜토리얼이 생기기 전부터 쓰던 사람(저장된 지역이 있음)은 이미 본 것으로 친다.
  globalThis.__files.clear();
  await storage.saveSelectedRegion({ city: '서울', region: '종로구' });
  assert.equal((await storage.loadStoredAppState()).tutorialSeen, true);
});

test('푸시 토큰은 계속 SecureStore에 둔다', async () => {
  await storage.saveNotificationToken('ExponentPushToken[test]');
  assert.equal(globalThis.__secure.get('dust.notification-token'), 'ExponentPushToken[test]');
  assert.equal([...globalThis.__files.keys()].some((key) => key.includes('notification-token')), false);
});
