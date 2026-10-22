import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoney, analyzeScenario, exportScenarioCsv } from '../src/engine.mjs';

const data = (paid = ['20.01', '0.00', '10.00']) => ({
  title: 'Weekend trip', currency: 'USD',
  participants: paid.map((value, index) => ({
    id: 'p' + (index + 1), name: ['Ava', 'Noah', 'Maya'][index], paid: value
  }))
});

test('strict decimal conversion never accepts floating sub-cent amounts', () => {
  assert.equal(parseMoney('0'), 0);
  assert.equal(parseMoney('0.01'), 1);
  assert.equal(parseMoney('0.10'), 10);
  assert.equal(parseMoney('200.32'), 20032);
  assert.throws(() => parseMoney('-1'));
  assert.throws(() => parseMoney('1e5'));
  assert.throws(() => parseMoney('0.001'));
  assert.throws(() => parseMoney('Infinity'));
});

test('rounding conserves every cent and transfer totals match debts', () => {
  const report = analyzeScenario(data());
  assert.equal(report.totalCents, 3001);
  assert.equal(report.ledger.reduce((sum, p) => sum + p.shareCents, 0), 3001);
  assert.equal(report.ledger.reduce((sum, p) => sum + p.netCents, 0), 0);
  assert.equal(report.transfers.reduce((sum, t) => sum + t.cents, 0), report.outstandingCents);
  assert.deepEqual(report.ledger.map(p => p.shareCents), [1001, 1000, 1000]);
});

test('all-even contributions require no repayments', () => {
  const report = analyzeScenario(data(['5.00', '5.00', '5.00']));
  assert.deepEqual(report.transfers, []);
  assert.equal(report.outstandingCents, 0);
});

test('tiny edge case preserves one cent with deterministic remainder', () => {
  const report = analyzeScenario(data(['0.01', '0.00', '0.00']));
  assert.deepEqual(report.ledger.map(p => p.shareCents), [1, 0, 0]);
  assert.deepEqual(report.transfers, []);
});

test('reject invalid scenario data', () => {
  assert.throws(() => analyzeScenario({participants: []}));
  const duplicate = data();
  duplicate.participants[1].name = 'ava';
  assert.throws(() => analyzeScenario(duplicate));
  assert.throws(() => analyzeScenario({...data(), currency:'JPY'}));
  assert.throws(() => analyzeScenario({...data(), participants:data().participants.map(p => ({...p, paid:'-12'}))}));
});

test('prevents spreadsheet injection from malicious user names', () => {
  const csv = exportScenarioCsv({
    ledger: [{name:'=HYPERLINK("https://invalid","click")',paidCents:100,shareCents:100,netCents:0}],
    transfers: []
  });
  assert.ok(csv.includes('"\'=HYPERLINK('));
  assert.ok(csv.startsWith('\uFEFF'));
});

test('supports display formatting for currencies with two decimals', () => {
  assert.ok(formatMoney(123456, 'USD').includes('1,234.56'));
  assert.ok(formatMoney(999, 'SAR').includes('9.99'));
});
