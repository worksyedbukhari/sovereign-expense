const express = require('express');
const { run, get, all, withTransaction } = require('../database');
const { parseAmountToCents, centsToAmount } = require('../utils/money');
const authenticate = require('../middleware/auth');
const { personalBalances } = require('../utils/balances');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const settlements = await all(`
      SELECT s.*,
        payer.name as payer_name,
        payee.name as payee_name,
        g.name as group_name
      FROM settlements s
      JOIN users payer ON s.payer_id = payer.id
      JOIN users payee ON s.payee_id = payee.id
      LEFT JOIN groups g ON s.group_id = g.id
      WHERE s.payer_id = $1 OR s.payee_id = $1
      ORDER BY s.created_at DESC
    `, [req.user.id]);
    res.json(settlements);
  } catch (err) {
    console.error('GET /settlements error:', err);
    res.status(500).json({ error: 'Failed to fetch settlements' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { payee_id, amount, group_id, note } = req.body || {};
    const payeeId = Number(payee_id);
    const cents = parseAmountToCents(amount);
    if (!Number.isSafeInteger(payeeId) || payeeId < 1 || payeeId === req.user.id || cents === null) {
      return res.status(400).json({ error: 'A different payee and a valid positive amount are required' });
    }
    if (group_id != null && (!Number.isSafeInteger(Number(group_id)) || Number(group_id) < 1)) {
      return res.status(400).json({ error: 'Invalid group' });
    }
    const mutual = await get(
      `SELECT gm1.group_id FROM group_members gm1
       JOIN group_members gm2 ON gm1.group_id = gm2.group_id
       WHERE gm1.user_id = $1 AND gm2.user_id = $2
       AND ($3::integer IS NULL OR gm1.group_id = $3) LIMIT 1`,
      [req.user.id, payeeId, group_id || null]
    );
    if (!mutual) return res.status(403).json({ error: 'Settlements require a shared group' });
    const result = await withTransaction(async tx => {
      const settlementId = await tx.run(
        'INSERT INTO settlements (payer_id, payee_id, amount, group_id, note) VALUES ($1, $2, $3, $4, $5)',
        [req.user.id, payeeId, centsToAmount(cents), group_id || null, typeof note === 'string' ? note.slice(0,500) : '']
      );
      const settlement = await tx.get(
        'SELECT s.*, payer.name as payer_name, payee.name as payee_name FROM settlements s JOIN users payer ON s.payer_id = payer.id JOIN users payee ON s.payee_id = payee.id WHERE s.id = $1',
        [settlementId]
      );
      await tx.run(
        'INSERT INTO notifications (user_id, type, title, message, related_id) VALUES ($1, $2, $3, $4, $5)',
        [payeeId, 'settlement', 'Payment Received', `${req.user.name} paid you ${centsToAmount(cents)}`, settlementId]
      );
      return settlement;
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('POST /settlements error:', error);
    res.status(500).json({ error: 'Failed to create settlement' });
  }
});

router.get('/balances', authenticate, async (req, res) => {
  try {
    const userExpenses = await all(`
      SELECT e.paid_by as paid_by_id, es.user_id, es.amount, es.is_settled
      FROM expenses e
      JOIN expense_splits es ON e.id = es.expense_id
      WHERE (e.paid_by = $1 OR es.user_id = $1)
      AND es.user_id != e.paid_by
    `, [req.user.id]);

    const userSettlements = await all(`
      SELECT payer_id, payee_id, amount
      FROM settlements
      WHERE payer_id = $1 OR payee_id = $1
    `, [req.user.id]);

    // Positive balance means the other person owes this user; negative means the user owes them.
    // Compute in integer cents to avoid floating-point accumulation errors.
    const result = personalBalances(userExpenses, userSettlements, req.user.id);

    const userIds = result.map(b => b.userId);
    if (userIds.length === 0) return res.json([]);

    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
    const users = await all(`SELECT id, name FROM users WHERE id IN (${placeholders})`, userIds);

    const userMap = {};
    users.forEach(u => { userMap[u.id] = u.name; });

    const enriched = result.map(b => ({
      ...b,
      name: userMap[b.userId] || 'Unknown',
      you_owe: b.balance < 0,
      they_owe: b.balance > 0,
      amount: Math.abs(b.balance)
    }));

    res.json(enriched);
  } catch (err) {
    console.error('GET /settlements/balances error:', err);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
});

router.get('/simplify', authenticate, async (req, res) => {
  try {
    const balances = await all(`
      SELECT e.paid_by as creditor, es.user_id as debtor, SUM(es.amount) as amount
      FROM expenses e
      JOIN expense_splits es ON e.id = es.expense_id
      WHERE es.user_id != e.paid_by AND es.is_settled = 0
      AND e.group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = $1)
      GROUP BY e.paid_by, es.user_id
    `, [req.user.id]);

    const net = {};
    for (const b of balances) {
      if (!net[b.creditor]) net[b.creditor] = 0;
      if (!net[b.debtor]) net[b.debtor] = 0;
      net[b.creditor] += b.amount;
      net[b.debtor] -= b.amount;
    }

    const debtors = [];
    const creditors = [];

    for (const [userId, amount] of Object.entries(net)) {
      if (amount < -0.01) debtors.push({ userId: parseInt(userId), amount: Math.abs(amount) });
      else if (amount > 0.01) creditors.push({ userId: parseInt(userId), amount });
    }

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const transactions = [];
    let di = 0, ci = 0;

    while (di < debtors.length && ci < creditors.length) {
      const amount = Math.min(debtors[di].amount, creditors[ci].amount);
      if (amount > 0.01) {
        transactions.push({
          from: debtors[di].userId,
          to: creditors[ci].userId,
          amount: Math.round(amount * 100) / 100
        });
      }
      debtors[di].amount -= amount;
      creditors[ci].amount -= amount;
      if (debtors[di].amount < 0.01) di++;
      if (creditors[ci].amount < 0.01) ci++;
    }

    const userIds = [...new Set(transactions.flatMap(t => [t.from, t.to]))];
    if (userIds.length > 0) {
      const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
      const users = await all(`SELECT id, name FROM users WHERE id IN (${placeholders})`, userIds);
      const userMap = {};
      users.forEach(u => { userMap[u.id] = u.name; });

      const enriched = transactions.map(t => ({
        from: t.from,
        from_name: userMap[t.from] || 'Unknown',
        to: t.to,
        to_name: userMap[t.to] || 'Unknown',
        amount: t.amount
      }));

      return res.json(enriched);
    }

    res.json(transactions);
  } catch (err) {
    console.error('GET /settlements/simplify error:', err);
    res.status(500).json({ error: 'Failed to simplify debts' });
  }
});

module.exports = router;
