import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionPatch, isUntailored } from '../app/cloud/reviewStatus.js';
import { canTransition, STATUSES, BOARD_COLUMNS } from '../app/schemas/job.js';
test('right swipe selects; left swipe archives; acknowledged undo restores queue', () => {
  const fresh={status:'scored',archived:0};
  const selected={...fresh,...decisionPatch(fresh,{decision:'keep',revision:1})};
  assert.equal(selected.status,'selected'); assert.equal(selected.archived,0);
  const archived={...selected,...decisionPatch(selected,{decision:'pass',revision:2})};
  assert.equal(archived.status,'archived'); assert.equal(archived.archived,1);
  const undo={...archived,...decisionPatch(archived,{decision:'unseen',revision:3})};
  assert.equal(undo.status,'scored'); assert.equal(undo.archived,0);
  assert.equal(decisionPatch(undo,{decision:'pass',revision:2}),null);
});
test('sync never rolls back tailored/applied jobs or revives manually archived jobs', () => {
  for (const job of [{status:'applied'},{status:'tailored'},{status:'scored',bestRunId:'run-1'},{status:'archived',archived:1}]) {
    assert.deepEqual(decisionPatch(job,{decision:'keep',revision:1}),{cloudReviewRevision:1});
    assert.equal(isUntailored(job),false);
  }
  assert.equal(isUntailored({status:'scored',archived:0}),true);
  assert.equal(isUntailored({status:'selected'}),false);
});
test('selected is a valid workflow and board status with onward tailoring', () => {
  assert.ok(STATUSES.includes('selected')); assert.ok(BOARD_COLUMNS.includes('selected'));
  assert.ok(canTransition('scored','selected')); assert.ok(canTransition('selected','tailored'));
  assert.ok(canTransition('selected','archived'));
});
