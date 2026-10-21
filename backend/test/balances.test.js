'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { amountToCents, personalBalances } = require('../utils/balances');

test('stored two-decimal amounts convert to exact integer cents', () => {
  assert.equal(amountToCents('0.01'), 1);
  assert.equal(amountToCents('5.20'), 520);
  assert.equal(amountToCents(5.2), 520);
  assert.equal(amountToCents(0), 0);
  assert.throws(() => amountToCents('0.001'));
});

test('expense payer is owed money, participant owes the payer', () => {
  const expense = [{ paid_by_id: 1, user_id: 2, amount: '50.00', is_settled: 0 }];
  assert.deepEqual(personalBalances(expense, [], 1), [{ userId: 2, balance: 50 }]);
  assert.deepEqual(personalBalances(expense, [], 2), [{ userId: 1, balance: -50 }]);
});

test('repayments reduce the outstanding debt in either view', () => {
  const expense = [{ paid_by_id: 1, user_id: 2, amount: '50.00', is_settled: 0 }];
  const payment = [{ payer_id: 2, payee_id: 1, amount: '20.15' }];
  assert.deepEqual(personalBalances(expense, payment, 1), [{ userId: 2, balance: 29.85 }]);
  assert.deepEqual(personalBalances(expense, payment, 2), [{ userId: 1, balance: -29.85 }]);
});

test('tiny shares accumulate without drift and zero balances disappear', () => {
  const expenses = [
    { paid_by_id: 1, user_id: 2, amount: '0.01', is_settled: 0 },
    { paid_by_id: 1, user_id: 2, amount: '0.02', is_settled: 0 },
    { paid_by_id: 1, user_id: 2, amount: '0.03', is_settled: 1 }
  ];
  assert.deepEqual(personalBalances(expenses, [{payer_id:2,payee_id:1,amount:'0.03'}], 1), []);
});
