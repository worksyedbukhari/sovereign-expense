'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { amountToCents, personalBalances, groupBalances } = require('../utils/balances');

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

test('group balances use exact cents and ignore settled shares', () => {
  const splits = [
    {paid_by:1, user_id:2, amount:'0.01', is_settled:0},
    {paid_by:1, user_id:2, amount:'0.02', is_settled:0},
    {paid_by:1, user_id:3, amount:'50.50', is_settled:1}
  ];
  assert.deepEqual(groupBalances(splits), [{userId:1,balance:0.03},{userId:2,balance:-0.03}]);
});

test('group balances net opposite-direction expenses correctly', () => {
  assert.deepEqual(groupBalances([
    {paid_by:1,user_id:2,amount:'75.00',is_settled:0},
    {paid_by:2,user_id:1,amount:'25.00',is_settled:0}
  ]), [{userId:1,balance:50},{userId:2,balance:-50}]);
});

test('group balances reject impossible financial inputs', () => {
  assert.throws(()=>groupBalances([{paid_by:1,user_id:2,amount:'1.234',is_settled:0}]));
  assert.throws(()=>groupBalances([{paid_by:'garbage',user_id:2,amount:'1.00',is_settled:0}]));
});
