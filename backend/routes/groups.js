const express = require('express');
const { run, get, all, withTransaction } = require('../database');
const authenticate = require('../middleware/auth');
const { groupBalances } = require('../utils/balances');

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
    const { name, description, memberIds = [] } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.length > 120) {
      return res.status(400).json({ error: 'A group name of up to 120 characters is required' });
    }
    if (!Array.isArray(memberIds) || memberIds.length > 100 ||
        memberIds.some(id => !Number.isSafeInteger(Number(id)) || Number(id) < 1)) {
      return res.status(400).json({ error: 'Invalid group members' });
    }
    const uniqueMembers = [...new Set(memberIds.map(Number))].filter(id => id !== req.user.id);
    const group = await withTransaction(async tx => {
      const groupId = await tx.run(
        'INSERT INTO groups (name, description, creator_id) VALUES ($1, $2, $3)',
        [name.trim(), typeof description === 'string' ? description.slice(0, 2000) : '', req.user.id]
      );
      await tx.run(
        'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)',
        [groupId, req.user.id, 'admin']
      );
      for (const memberId of uniqueMembers) {
        await tx.run(
          'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
          [groupId, memberId]
        );
      }
      return tx.get('SELECT * FROM groups WHERE id = $1', [groupId]);
    });
    res.status(201).json(group);
  } catch (err) {
    console.error('POST /groups error:', err);
    res.status(err.code === '23503' ? 400 : 500).json({
      error: err.code === '23503' ? 'One or more group members do not exist' : 'Failed to create group'
    });
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

    // Group members, expenses and messages cascade from the group deletion.
    // Deleting the group in one database statement avoids partially deleted groups.
    await run('DELETE FROM groups WHERE id = $1', [req.params.id]);
    const io = req.app.get('io');
    if (io) io.in(`group_${Number(req.params.id)}`).socketsLeave(`group_${Number(req.params.id)}`);
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
    const io = req.app.get('io');
    if (io) {
      // Revoke already-connected sockets immediately, not only on their next event.
      io.in(`user_${Number(req.params.userId)}`).socketsLeave(`group_${Number(req.params.id)}`);
    }
    res.json({ message: 'Member removed' });
  } catch (err) {
    console.error('DELETE /groups/:id/members/:userId error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

router.get('/:id/balances', authenticate, async (req, res) => {
  try {
    const membership = await get(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

    const rows = await all(`
      SELECT e.paid_by, es.user_id, es.amount, es.is_settled
      FROM expenses e
      JOIN expense_splits es ON es.expense_id = e.id
      WHERE e.group_id = $1 AND es.user_id != e.paid_by
    `, [req.params.id]);
    const balances = groupBalances(rows);
    if (!balances.length) return res.json([]);

    const users = await all(
      'SELECT u.id, u.name FROM users u JOIN group_members gm ON gm.user_id = u.id WHERE gm.group_id = $1',
      [req.params.id]
    );
    const memberMap = new Map(users.map(user => [user.id, user.name]));
    res.json(balances.map(row => ({
      ...row,
      name: memberMap.get(row.userId) || 'Unknown'
    })));
  } catch (err) {
    console.error('GET /groups/:id/balances error:', err);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
});

module.exports = router;
