import assert from 'node:assert/strict';
import test from 'node:test';

import { replaceCalendarNotifications } from './calendarNotificationSync.ts';

test('failed replacement keeps the existing calendar reminder', async () => {
  const scheduled = new Set(['old-reminder']);
  let savedIds = ['old-reminder'];
  await assert.rejects(replaceCalendarNotifications(['old-reminder'], [{ id: 'event-1' }], {
    cancel: async (ids) => ids.forEach((id) => scheduled.delete(id)),
    isCurrent: () => true,
    save: async (ids) => { savedIds = ids; },
    schedule: async () => { throw new Error('native scheduling failed'); },
  }), /native scheduling failed/);
  assert.deepEqual([...scheduled], ['old-reminder']);
  assert.deepEqual(savedIds, ['old-reminder']);
});

test('partial scheduling failure removes only newly created reminders', async () => {
  const scheduled = new Set(['old-reminder']);
  let savedIds = ['old-reminder'];
  await assert.rejects(replaceCalendarNotifications(['old-reminder'], [{ id: 'first' }, { id: 'second' }], {
    cancel: async (ids) => ids.forEach((id) => scheduled.delete(id)),
    isCurrent: () => true,
    save: async (ids) => { savedIds = ids; },
    schedule: async (event) => {
      if (event.id === 'second') throw new Error('native scheduling failed');
      scheduled.add('new-reminder');
      return ['new-reminder'];
    },
  }), /native scheduling failed/);
  assert.deepEqual([...scheduled], ['old-reminder']);
  assert.deepEqual(savedIds, ['old-reminder']);
});

test('successful replacement saves the new identifier before cancelling the old one', async () => {
  const order = [];
  await replaceCalendarNotifications(['old-reminder'], [{ id: 'event-1' }], {
    cancel: async (ids) => { order.push(`cancel:${ids.join(',')}`); },
    isCurrent: () => true,
    save: async (ids) => { order.push(`save:${ids.join(',')}`); },
    schedule: async () => { order.push('schedule:new-reminder'); return ['new-reminder']; },
  });
  assert.deepEqual(order, ['schedule:new-reminder', 'save:new-reminder', 'cancel:old-reminder']);
});

test('storage failure keeps the old reminder and rolls back the new one', async () => {
  const scheduled = new Set(['old-reminder']);
  await assert.rejects(replaceCalendarNotifications(['old-reminder'], [{ id: 'event-1' }], {
    cancel: async (ids) => ids.forEach((id) => scheduled.delete(id)),
    isCurrent: () => true,
    save: async () => { throw new Error('storage failed'); },
    schedule: async () => { scheduled.add('new-reminder'); return ['new-reminder']; },
  }), /storage failed/);
  assert.deepEqual([...scheduled], ['old-reminder']);
});

test('turning reminders off clears storage and cancels the old reminder', async () => {
  const scheduled = new Set(['old-reminder']);
  let savedIds = ['old-reminder'];
  await replaceCalendarNotifications(['old-reminder'], [], {
    cancel: async (ids) => ids.forEach((id) => scheduled.delete(id)),
    isCurrent: () => true,
    save: async (ids) => { savedIds = ids; },
    schedule: async () => { throw new Error('no events should be scheduled'); },
  });
  assert.deepEqual(savedIds, []);
  assert.deepEqual([...scheduled], []);
});

test('overlapping app and background syncs leave exactly one reminder per event', async () => {
  const { runCalendarNotificationSyncExclusive } = await import('./calendarNotificationSync.ts');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let run = 0; run < 50; run += 1) {
    const scheduled = new Set();
    let stored = [];
    let sequence = 0;
    let savedEvents = [{ id: 'e1' }, { id: 'e2' }];
    const sync = (loadEvents, delay) => runCalendarNotificationSyncExclusive(async () => {
      await sleep(delay);
      const events = await loadEvents();
      await replaceCalendarNotifications(stored, events, {
        cancel: async (ids) => { await sleep(Math.random() * 3); ids.forEach((id) => scheduled.delete(id)); },
        isCurrent: () => true,
        save: async (ids) => { await sleep(Math.random() * 3); stored = ids; },
        schedule: async (event) => { await sleep(Math.random() * 3); const id = `${event.id}-${sequence++}`; scheduled.add(id); return [id]; },
      });
    });
    // 화면은 새 일정 e3를 저장하고 예약하고, 같은 때 백그라운드도 저장된 일정을 다시 읽어 예약한다.
    savedEvents = [...savedEvents, { id: 'e3' }];
    await Promise.all([sync(async () => savedEvents, Math.random() * 5), sync(async () => savedEvents, Math.random() * 5)]);
    assert.deepEqual([...scheduled].sort(), [...stored].sort());
    assert.deepEqual([...scheduled].map((id) => id.split('-')[0]).sort(), ['e1', 'e2', 'e3']);
  }
});
