import { test, assert } from './harness.js';
import { loadCV, JD_DELIVERY } from './fixtures/load.js';
import { buildSlice } from '../app/slice/cvSlice.js';
test('slice keeps all bullets of 3 most recent roles and caps older ones', async () => {
  const cv = await loadCV(); const { slice } = buildSlice(cv, JD_DELIVERY, { recentRoles: 3, olderCap: 1 });
  assert.equal(slice.experience[0].bullets.length, 4); assert.equal(slice.experience[3].bullets.length, 1);
});
test('slice respects char budget by trimming oldest roles', async () => {
  const cv = await loadCV(); const { chars, slice } = buildSlice(cv, JD_DELIVERY, { charBudget: 4200, recentRoles: 1 });
  assert.ok(chars <= 4300, `chars ${chars}`); assert.ok(slice.experience[0].bullets.length >= 2); assert.equal(slice.experience[3].bullets.length, 0);
});
test('slice is ordered most recent first', async () => { const cv = await loadCV(); const { slice } = buildSlice(cv, JD_DELIVERY); assert.equal(slice.experience[0].id, 'exp_bank'); });
test('placeholder bullets are never sent to the model', async () => {
  const cv = await loadCV();
  cv.experience[0].bullets[0].placeholder = true;
  const { slice, includedBulletIds } = buildSlice(cv, JD_DELIVERY);
  assert.ok(!includedBulletIds.includes('b_bank_01'));
  assert.ok(!JSON.stringify(slice).includes('b_bank_01'));
});
