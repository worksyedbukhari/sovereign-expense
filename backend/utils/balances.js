'use strict';

// Keep financial ledgers in integer minor units until values are serialized.
function amountToCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new TypeError('Invalid amount');
  const text = String(value);
  if (!/^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,2}))?$/.test(text)) {
    throw new RangeError('Amount must have at most two decimal places');
  }
  const parts = text.split('.');
  const cents = Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new RangeError('Amount is too large');
  return cents;
}

function personalBalances(expenses, settlements, currentUserId) {
  if (!Number.isSafeInteger(currentUserId) || currentUserId < 1) throw new Error('Invalid user');
  const net = new Map();
  function add(other, cents) {
    if (!Number.isSafeInteger(other) || other < 1 || other === currentUserId) return;
    const total = (net.get(other) || 0) + cents;
    if (!Number.isSafeInteger(total)) throw new RangeError('Balance is too large');
    net.set(other, total);
  }

  for (const e of expenses) {
    if (e.is_settled === true || Number(e.is_settled) === 1) continue;
    const payer = Number(e.paid_by_id);
    const participant = Number(e.user_id);
    const cents = amountToCents(e.amount);
    if (payer === currentUserId && participant !== payer) add(participant, cents);
    else if (participant === currentUserId && participant !== payer) add(payer, -cents);
  }
  for (const s of settlements) {
    const payer = Number(s.payer_id), payee = Number(s.payee_id);
    const cents = amountToCents(s.amount);
    if (payer === currentUserId) add(payee, cents);
    else if (payee === currentUserId) add(payer, -cents);
  }

  return [...net.entries()].filter(([,cents]) => cents !== 0)
    .map(([userId,cents]) => ({ userId, balance: cents / 100 }));
}
module.exports = { amountToCents, personalBalances };
