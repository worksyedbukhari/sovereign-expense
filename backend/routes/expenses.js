const express = require('express');
const { run, get, all, withTransaction } = require('../database');
const { parseAmountToCents, centsToAmount, allocateEqual, validateCustomSplits } = require('../utils/money');
const authenticate = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { group_id, category, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = `
      WHERE (e.paid_by = $1 OR e.id IN (SELECT expense_id FROM expense_splits WHERE user_id = $1))
    `;
    const params = [req.user.id];

    if (group_id) {
      whereClause += ` AND e.group_id = $${params.length + 1}`;
      params.push(group_id);
    }
    if (category) {
      whereClause += ` AND e.category = $${params.length + 1}`;
      params.push(category);
    }

    const expenses = await all(`
      SELECT e.*, u.name as paid_by_name, g.name as group_name,
        (SELECT COUNT(*) FROM expense_splits WHERE expense_id = e.id) as split_count
      FROM expenses e
      JOIN users u ON e.paid_by = u.id
      LEFT JOIN groups g ON e.group_id = g.id
      ${whereClause}
      ORDER BY e.date DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, parseInt(limit), parseInt(offset)]);

    const totalResult = await get(`
      SELECT COUNT(*) as count
      FROM expenses e
      ${whereClause}
    `, params);

    res.json({ expenses, total: totalResult ? totalResult.count : 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('GET /expenses error:', err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { group_id, description, amount, category, split_type, splits, date } = req.body;
    const cents = parseAmountToCents(amount);
    if (!Number.isSafeInteger(Number(group_id)) || Number(group_id) < 1) {
      return res.status(400).json({ error: 'A valid group is required' });
    }
    if (typeof description !== 'string' || !description.trim() || description.length > 500 || cents === null) {
      return res.status(400).json({ error: 'A description and a positive amount with at most two decimals are required' });
    }
    if (date && Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'Invalid date' });

    // Validate and write on a single connection so errors roll back all financial records.
    const result = await withTransaction(async (tx) => {
      const members = await tx.all('SELECT user_id FROM group_members WHERE group_id = $1 ORDER BY user_id', [group_id]);
      const memberIds = members.map(member => member.user_id);
      if (!memberIds.includes(req.user.id)) {
        const error = new Error('Not a member of this group'); error.status = 403; throw error;
      }
      let splitRows;
      try {
        splitRows = Array.isArray(splits) && splits.length
          ? validateCustomSplits(splits, memberIds, cents)
          : allocateEqual(cents, memberIds);
      } catch (error) {
        error.status = 400; throw error;
      }

      const expenseId = await tx.run(
        'INSERT INTO expenses (group_id, paid_by, description, amount, category, split_type, date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [group_id, req.user.id, description.trim(), centsToAmount(cents), category || 'General', split_type || 'equal', date || new Date().toISOString()]
      );
      for (const split of splitRows) {
        await tx.run('INSERT INTO expense_splits (expense_id, user_id, amount) VALUES ($1, $2, $3)',
          [expenseId, split.user_id, split.amount]);
      }
      for (const memberId of memberIds.filter(id => id !== req.user.id)) {
        await tx.run(
          'INSERT INTO notifications (user_id, type, title, message, related_id) VALUES ($1, $2, $3, $4, $5)',
          [memberId, 'expense_added', 'New Expense', `${req.user.name} added "${description.trim()}" for ${centsToAmount(cents)}`, expenseId]
        );
      }
      const expense = await tx.get(
        'SELECT e.*, u.name as paid_by_name, g.name as group_name FROM expenses e JOIN users u ON e.paid_by = u.id JOIN groups g ON e.group_id = g.id WHERE e.id = $1',
        [expenseId]
      );
      const expenseSplits = await tx.all(
        'SELECT es.*, u.name FROM expense_splits es JOIN users u ON es.user_id = u.id WHERE es.expense_id = $1',
        [expenseId]
      );
      return { ...expense, splits: expenseSplits };
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('POST /expenses error:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed to create expense' });
  }
});

router.get('/categories/list', authenticate, (req, res) => {
  const categories = [
    'general', 'food', 'transport', 'entertainment', 'utilities',
    'rent', 'groceries', 'dining_out', 'travel', 'shopping',
    'health', 'education', 'subscriptions', 'gifts', 'other'
  ];
  res.json(categories);
});

router.get('/stats/monthly', authenticate, async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const monthlyExpenses = await all(`
      SELECT TO_CHAR(e.date, 'MM') as month, SUM(e.amount) as total, e.category
      FROM expenses e
      WHERE (e.paid_by = $1 OR e.id IN (SELECT expense_id FROM expense_splits WHERE user_id = $1))
      AND TO_CHAR(e.date, 'YYYY') = $2
      GROUP BY TO_CHAR(e.date, 'MM'), e.category
      ORDER BY month
    `, [req.user.id, String(year)]);
    res.json(monthlyExpenses);
  } catch (err) {
    console.error('GET /expenses/stats/monthly error:', err);
    res.status(500).json({ error: 'Failed to fetch monthly stats' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const expense = await get(`
      SELECT e.*, u.name as paid_by_name, g.name as group_name
      FROM expenses e
      JOIN users u ON e.paid_by = u.id
      LEFT JOIN groups g ON e.group_id = g.id
      WHERE e.id = $1
    `, [req.params.id]);

    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    const membership = await get(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [expense.group_id, req.user.id]
    );
    if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

    const splits = await all(`
      SELECT es.*, u.name
      FROM expense_splits es
      JOIN users u ON es.user_id = u.id
      WHERE es.expense_id = $1
    `, [expense.id]);

    res.json({ ...expense, splits });
  } catch (err) {
    console.error('GET /expenses/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const expense = await get('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    if (expense.paid_by !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    const { description, amount, category, date } = req.body;
    await run('UPDATE expenses SET description = COALESCE($1, description), amount = COALESCE($2, amount), category = COALESCE($3, category), date = COALESCE($4, date) WHERE id = $5',
      [description, amount, category, date, req.params.id]);

    if (amount) {
      const splits = await all('SELECT * FROM expense_splits WHERE expense_id = $1', [req.params.id]);
      const perPerson = amount / splits.length;
      for (const split of splits) {
        await run('UPDATE expense_splits SET amount = $1 WHERE id = $2', [Math.round(perPerson * 100) / 100, split.id]);
      }
    }

    const updated = await get('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error('PUT /expenses/:id error:', err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const expense = await get('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    if (expense.paid_by !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    await run('DELETE FROM expense_splits WHERE expense_id = $1', [req.params.id]);
    await run('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    console.error('DELETE /expenses/:id error:', err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

module.exports = router;
