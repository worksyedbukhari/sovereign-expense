// Money is validated and divided in integer cents to avoid floating-point drift.
// Currencies with non-2-decimal minor units are not yet supported.
function parseAmountToCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  const match = /^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,2}))?$/.exec(text);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function centsToAmount(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Invalid money amount');
  return (cents / 100).toFixed(2);
}

function allocateEqual(cents, userIds) {
  if (!Number.isSafeInteger(cents) || cents < 1 || !Array.isArray(userIds) || !userIds.length) {
    throw new Error('Invalid split');
  }
  const sorted = [...userIds].map(Number).sort((a, b) => a - b);
  if (new Set(sorted).size !== sorted.length || sorted.some(id => !Number.isSafeInteger(id) || id < 1)) {
    throw new Error('Invalid users');
  }
  const per = Math.floor(cents / sorted.length);
  const remainder = cents % sorted.length;
  return sorted.map((userId, index) => ({
    user_id: userId,
    amount: centsToAmount(per + (index < remainder ? 1 : 0))
  }));
}

function validateCustomSplits(splits, memberIds, expectedCents) {
  if (!Array.isArray(splits) || splits.length === 0) throw new Error('Splits are required');
  const allowed = new Set(memberIds.map(Number));
  const seen = new Set();
  let sum = 0;
  const normalized = splits.map(split => {
    const userId = Number(split && split.user_id);
    const cents = parseAmountToCents(split && split.amount);
    if (!Number.isSafeInteger(userId) || !allowed.has(userId) || seen.has(userId) || cents === null) {
      throw new Error('Splits must contain unique group members with positive two-decimal amounts');
    }
    seen.add(userId);
    sum += cents;
    return { user_id: userId, amount: centsToAmount(cents) };
  });
  if (sum !== expectedCents) throw new Error('Split amounts must add up exactly to the expense total');
  return normalized;
}

module.exports = { parseAmountToCents, centsToAmount, allocateEqual, validateCustomSplits };
