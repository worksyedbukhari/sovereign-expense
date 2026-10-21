'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAmountToCents, centsToAmount, allocateEqual, validateCustomSplits
} = require('../utils/money');

test('accepts finite positive two-decimal amounts in cents', () => {
  assert.equal(parseAmountToCents('0.01'), 1);
  assert.equal(parseAmountToCents('12.30'), 1230);
  assert.equal(parseAmountToCents(20), 2000);
  assert.equal(parseAmountToCents('1.2'), 120);
});

test('rejects malformed or imprecise money', () => {
  for (const input of [0, -1, '0', '0.00', '1.234', '1e3', '1,000', '01.00', 'NaN', Infinity, null, undefined]) {
    assert.equal(parseAmountToCents(input), null, String(input));
  }
});

test('formats exact cents', () => {
  assert.equal(centsToAmount(1), '0.01');
  assert.equal(centsToAmount(1234), '12.34');
  assert.throws(() => centsToAmount(-1));
  assert.throws(() => centsToAmount(0.5));
});

test('equal shares allocate remainders deterministically and total exactly', () => {
  const shares = allocateEqual(100, [3, 1, 2]);
  assert.deepEqual(shares, [
    { user_id: 1, amount: '0.34' },
    { user_id: 2, amount: '0.33' },
    { user_id: 3, amount: '0.33' }
  ]);
  assert.equal(shares.reduce((sum, share) => sum + parseAmountToCents(share.amount), 0), 100);
});

test('equal shares reject empty or repeated recipients', () => {
  assert.throws(() => allocateEqual(100, []));
  assert.throws(() => allocateEqual(100, [1, 1]));
  assert.throws(() => allocateEqual(0, [1, 2]));
});

test('custom splits must total the expense and belong to the group', () => {
  assert.deepEqual(
    validateCustomSplits([{ user_id: 1, amount: '0.40' }, { user_id: 2, amount: '0.60' }], [1, 2], 100),
    [{ user_id: 1, amount: '0.40' }, { user_id: 2, amount: '0.60' }]
  );
  assert.throws(() => validateCustomSplits([{ user_id: 1, amount: '0.40' }], [1], 100));
  assert.throws(() => validateCustomSplits([{ user_id: 3, amount: '1.00' }], [1, 2], 100));
  assert.throws(() => validateCustomSplits([{ user_id: 1, amount: '0.50' }, { user_id: 1, amount: '0.50' }], [1], 100));
});
