const express = require('express');
const { run, get, all } = require('../database');
const authenticate = require('../middleware/auth');

const router = express.Router();

async function requireGroupAdmin(req, res, next) {
  try {
    const group = await get('SELECT creator_id FROM groups WHERE id = $1', [req.params.id]);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const membership = await get(
      'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!membership || (membership.role !== 'admin' && group.creator_id !== req.user.id)) {
      return res.status(403).json({ error: 'Only a group administrator can manage members' });
    }
    req.groupCreatorId = group.creator_id;
    next();
  } catch (error) {
    console.error('Group authorization error:', error);
    res.status(500).json({ error: 'Failed to authorize group access' });
  }
}


router.get('/', authenticate, async (req, res) => {
  try {
    const groups = await all(`
      SELECT g.*, gm.role,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = $1
      ORDER BY g.created_at DESC
    `, [req.user.id]);
    res.json(groups);
  } catch (err) {
    console.error('GET /groups error:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, memberIds } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name is required' });

    const groupId = await run('INSERT INTO groups (name, description, creator_id) VALUES ($1, $2, $3)', [name, description || '', req.user.id]);
    await run('INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)', [groupId, req.user.id, 'admin']);

    if (memberIds && memberIds.length > 0) {
      for (const memberId of memberIds) {
        try {
          await run('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [groupId, memberId]);
        } catch (e) { /* ignore duplicates */ }
      }
    }

    const group = await get('SELECT * FROM groups WHERE id = $1', [groupId]);
    res.status(201).json(group);
  } catch (err) {
    console.error('POST /groups error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const group = await get('SELECT * FROM groups WHERE id = $1', [req.params.id]);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const membership = await get('SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2', [group.id, req.user.id]);
    if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

    const members = await all(`
      SELECT u.id, u.name, u.email, u.avatar, gm.role
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = $1
    `, [group.id]);

    res.json({ ...group, members });
  } catch (err) {
    console.error('GET /groups/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    const group = await get('SELECT * FROM groups WHERE id = $1', [req.params.id]);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.creator_id !== req.user.id) return res.status(403).json({ error: 'Only the creator can update the group' });

    await run('UPDATE groups SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3',
      [name, description, req.params.id]);

    const updated = await get('SELECT * FROM groups WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error('PUT /groups/:id error:', err);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const group = await get('SELECT * FROM groups WHERE id = $1', [req.params.id]);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.creator_id !== req.user.id) return res.status(403).json({ error: 'Only the creator can delete the group' });

    await run('DELETE FROM group_members WHERE group_id = $1', [req.params.id]);
    await run('DELETE FROM groups WHERE id = $1', [req.params.id]);
    res.json({ message: 'Group deleted' });
  } catch (err) {
    console.error('DELETE /groups/:id error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

router.post('/:id/members', authenticate, requireGroupAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!Number.isSafeInteger(Number(userId)) || Number(userId) < 1) {
      return res.status(400).json({ error: 'Valid user ID required' });
    }
    const group = await get('SELECT * FROM groups WHERE id = $1', [req.params.id]);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    try {
      await run('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [req.params.id, userId]);
      res.json({ message: 'Member added' });
    } catch (err) {
      res.status(400).json({ error: 'User already in group or invalid user' });
    }
  } catch (err) {
    console.error('POST /groups/:id/members error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

router.delete('/:id/members/:userId', authenticate, requireGroupAdmin, async (req, res) => {
  try {
    const group = await get('SELECT * FROM groups WHERE id = $1', [req.params.id]);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (Number(req.params.userId) === req.groupCreatorId) {
      return res.status(403).json({ error: 'Cannot remove the group creator' });
    }
    await run('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (err) {
    console.error('DELETE /groups/:id/members/:userId error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

router.get('/:id/balances', authenticate, async (req, res) => {
  try {
    const membership = await get('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!membership) return res.status(403).json({ error: 'Not a member of this group' });
    const expenses = await all('SELECT * FROM expenses WHERE group_id = $1', [req.params.id]);
    const balances = {};

    for (const expense of expenses) {
      const splits = await all('SELECT * FROM expense_splits WHERE expense_id = $1', [expense.id]);
      if (!balances[expense.paid_by]) balances[expense.paid_by] = 0;

      for (const split of splits) {
        if (split.user_id === expense.paid_by) continue;
        if (!balances[split.user_id]) balances[split.user_id] = 0;
        if (!split.is_settled) {
          balances[expense.paid_by] += split.amount;
          balances[split.user_id] -= split.amount;
        }
      }
    }

    const members = await all(`
      SELECT u.id, u.name
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = $1
    `, [req.params.id]);

    const memberMap = {};
    members.forEach(m => { memberMap[m.id] = m.name; });

    const result = Object.entries(balances).map(([userId, balance]) => ({
      userId: parseInt(userId),
      name: memberMap[parseInt(userId)] || 'Unknown',
      balance: Math.round(balance * 100) / 100
    }));

    res.json(result);
  } catch (err) {
    console.error('GET /groups/:id/balances error:', err);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
});

module.exports = router;
