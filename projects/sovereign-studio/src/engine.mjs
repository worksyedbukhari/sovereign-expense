// Sovereign Studio - deterministic expense planning in integer minor units.
// Display-only currency choices; no FX conversion or financial advice.
export const CURRENCIES = Object.freeze({ USD: '$', EUR: '€', SAR: '﷼', PKR: '₨' });

export function parseMoney(value) {
  const text = String(value ?? '').trim();
  if (!/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/.test(text)) {
    throw new RangeError('Enter a non-negative amount, with up to two decimal places.');
  }
  const parts = text.split('.');
  return Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'));
}

export function formatMoney(cents, currency = 'USD') {
  if (!Number.isSafeInteger(cents)) throw new TypeError('Amount must be integer cents');
  if (!(currency in CURRENCIES)) throw new RangeError('Unsupported currency');
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(cents / 100);
}

function validateParticipant(person) {
  const name = String(person?.name ?? '').trim();
  if (!name || name.length > 42) throw new RangeError('Each name must be 1–42 characters.');
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(String(person?.id ?? ''))) {
    throw new RangeError('Invalid participant ID.');
  }
  return { id: person.id, name, paidCents: parseMoney(person.paid ?? '0') };
}

export function analyzeScenario(input) {
  const title = String(input?.title ?? 'Untitled scenario').trim().slice(0, 80);
  const currency = input?.currency ?? 'USD';
  if (!(currency in CURRENCIES)) throw new RangeError('Unsupported currency');
  if (!Array.isArray(input?.participants) || input.participants.length < 2 || input.participants.length > 12) {
    throw new RangeError('Add between 2 and 12 participants.');
  }
  const participants = input.participants.map(validateParticipant);
  if (new Set(participants.map(p => p.id)).size !== participants.length) throw new Error('Duplicate participant IDs');
  if (new Set(participants.map(p => p.name.toLocaleLowerCase('en'))).size !== participants.length) {
    throw new Error('Participant names must be unique');
  }
  const totalCents = participants.reduce((sum, p) => sum + p.paidCents, 0);
  if (!Number.isSafeInteger(totalCents)) throw new RangeError('Total amount is too large');
  const count = participants.length;
  const equal = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  const ledger = participants.map((p, i) => {
    const shareCents = equal + (i < remainder ? 1 : 0);
    return { ...p, shareCents, netCents: p.paidCents - shareCents };
  });
  if (ledger.reduce((sum, p) => sum + p.netCents, 0) !== 0) throw new Error('Ledger is not balanced');

  const creditors = ledger.filter(p => p.netCents > 0)
    .map(p => ({ id: p.id, name: p.name, remaining: p.netCents }))
    .sort((a, b) => b.remaining - a.remaining || a.id.localeCompare(b.id));
  const debtors = ledger.filter(p => p.netCents < 0)
    .map(p => ({ id: p.id, name: p.name, remaining: -p.netCents }))
    .sort((a, b) => b.remaining - a.remaining || a.id.localeCompare(b.id));

  const transfers = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const cents = Math.min(creditors[ci].remaining, debtors[di].remaining);
    if (cents > 0) transfers.push({
      fromId: debtors[di].id, from: debtors[di].name,
      toId: creditors[ci].id, to: creditors[ci].name, cents
    });
    creditors[ci].remaining -= cents;
    debtors[di].remaining -= cents;
    if (creditors[ci].remaining === 0) ci += 1;
    if (debtors[di].remaining === 0) di += 1;
  }
  if (creditors.some(p => p.remaining) || debtors.some(p => p.remaining)) {
    throw new Error('Settlement planning did not balance');
  }
  return {
    title, currency, totalCents,
    perPersonApproxCents: Math.round(totalCents / count),
    count, ledger, transfers,
    outstandingCents: ledger.reduce((sum, p) => sum + Math.max(0, p.netCents), 0)
  };
}

function safeCsvCell(value) {
  let text = String(value);
  // Prevent spreadsheet formula injection from untrusted names and notes.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function exportScenarioCsv(report) {
  const lines = [
    ['Participant', 'Paid', 'Fair share', 'Net balance'],
    ...report.ledger.map(p => [p.name, (p.paidCents / 100).toFixed(2),
      (p.shareCents / 100).toFixed(2), (p.netCents / 100).toFixed(2)]),
    [],
    ['From', 'To', 'Transfer', ''],
    ...report.transfers.map(t => [t.from, t.to, (t.cents / 100).toFixed(2), ''])
  ];
  return '\uFEFF' + lines.map(row => row.map(safeCsvCell).join(',')).join('\r\n') + '\r\n';
}
