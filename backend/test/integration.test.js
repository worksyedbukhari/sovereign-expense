'use strict';

// Integration tests intentionally require an isolated PostgreSQL database.
// Run with RUN_DB_INTEGRATION=1; never point DATABASE_URL at a database containing real data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

test('staging PostgreSQL: account, group, expense and settlement permissions', {
  skip: process.env.RUN_DB_INTEGRATION !== '1' && 'Requires isolated PostgreSQL test database'
}, async () => {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    throw new Error('DATABASE_URL and JWT_SECRET must be set for database integration tests');
  }

  const express = require('express');
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  const db = require('../database');
  const app = express();
  app.use(express.json());
  app.use('/api/groups', require('../routes/groups'));
  app.use('/api/expenses', require('../routes/expenses'));
  app.use('/api/settlements', require('../routes/settlements'));
  app.use('/api/chat', require('../routes/chat'));
  app.use('/api/auth', require('../routes/auth'));

  await db.initDatabase();
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  async function request(method, path, token, body) {
    const response = await fetch(url + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, json: await response.json() };
  }
  const marker = randomBytes(6).toString('hex');
  const ids = [];
  try {
    const password = await bcrypt.hash('synthetic-test-password-not-real', 10);
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      const id = await db.run(
        'INSERT INTO users (name, email, password) VALUES ($1, $2, $3)',
        [name, `ci-${marker}-${name.toLowerCase()}@example.invalid`, password]
      );
      ids.push(id);
    }
    const [alice, bob, charlie] = ids;
    const tokens = ids.map((id, i) => jwt.sign(
      { id, name: ['Alice', 'Bob', 'Charlie'][i] },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '5m' }
    ));
    const [aliceToken, bobToken, charlieToken] = tokens;

    assert.equal((await request('GET', '/api/groups', null)).status, 401, 'Anonymous group access denied');

    const forgedToken = jwt.sign({id: alice, name: 'Fake'}, 'incorrect-secret', {expiresIn:'5m'});
    assert.equal((await request('GET', '/api/groups', forgedToken)).status, 401,
      'Forged JWTs are rejected');
    assert.equal((await request('POST', '/api/auth/social-login', null, {
      uid: 'attacker-chosen-id', email: 'someone@example.invalid'
    })).status, 501, 'Unverified social login is disabled');
    assert.equal((await request('POST', '/api/auth/send-otp', null, {
      target: `ci-${marker}-alice@example.invalid`, purpose: 'register'
    })).status, 503, 'Registration OTP fails closed without configured SMTP');

    const invalidGroup = await request('POST', '/api/groups', aliceToken, {
      name: 'Should not exist', memberIds: [2147483647]
    });
    assert.equal(invalidGroup.status, 400, 'Invalid member triggers database rollback');
    const count = await db.get('SELECT COUNT(*)::int AS total FROM groups WHERE creator_id = $1', [alice]);
    assert.equal(count.total, 0, 'Failed group transaction leaves no partial group');

    const created = await request('POST', '/api/groups', aliceToken, {
      name: 'Synthetic test group', memberIds: [bob]
    });
    assert.equal(created.status, 201, JSON.stringify(created));
    const groupId = created.json.id;
    assert.ok(Number.isInteger(groupId));

    assert.equal((await request('GET', `/api/groups/${groupId}`, bobToken)).status, 200);
    assert.equal((await request('GET', `/api/groups/${groupId}`, charlieToken)).status, 403);
    assert.equal((await request('POST', `/api/groups/${groupId}/members`, bobToken, {
      userId: charlie
    })).status, 403, 'Non-admin cannot add group members');

    const rejectedExpense = await request('POST', '/api/expenses', charlieToken, {
      group_id: groupId, description: 'Unauthorized', amount: '10.01'
    });
    assert.equal(rejectedExpense.status, 403, 'Outsider cannot create group expenses');

    const expense = await request('POST', '/api/expenses', aliceToken, {
      group_id: groupId, description: 'Synthetic pizza', amount: '10.01'
    });
    assert.equal(expense.status, 201, JSON.stringify(expense));
    const expenseId = expense.json.id;
    assert.ok(Number.isInteger(expenseId));
    const cents = expense.json.splits
      .map(s => Math.round(Number(s.amount) * 100))
      .sort((a, b) => a - b);
    assert.deepEqual(cents, [500, 501], 'An odd cent is allocated exactly without loss');

    assert.equal((await request('GET', `/api/expenses/${expenseId}`, charlieToken)).status, 403);
    assert.equal((await request('DELETE', `/api/expenses/${expenseId}`, bobToken)).status, 403);

    const aliceBalances = await request('GET', '/api/settlements/balances', aliceToken);
    assert.equal(aliceBalances.status, 200, JSON.stringify(aliceBalances));
    assert.ok(aliceBalances.json.some(x => x.userId === bob && x.they_owe && x.amount === 5),
      'Payer is owed exactly the participant share');
    const bobBalances = await request('GET', '/api/settlements/balances', bobToken);
    assert.equal(bobBalances.status, 200);
    assert.ok(bobBalances.json.some(x => x.userId === alice && x.you_owe && x.amount === 5),
      'Participant owes the payer');

    const outsiderChat = await request('GET', `/api/chat/${groupId}`, charlieToken);
    assert.equal(outsiderChat.status, 403, 'Group chat is private');

    const payment = await request('POST', '/api/settlements', bobToken, {
      group_id: groupId, payee_id: alice, amount: '3.50'
    });
    assert.equal(payment.status, 201, JSON.stringify(payment));
    const afterPayment = await request('GET', '/api/settlements/balances', aliceToken);
    assert.ok(afterPayment.json.some(x => x.userId === bob && x.they_owe && x.amount === 1.5),
      'Repayment reduces the outstanding balance');

    const groupBalances = await request('GET', `/api/groups/${groupId}/balances`, aliceToken);
    assert.equal(groupBalances.status, 200, JSON.stringify(groupBalances));
    assert.ok(groupBalances.json.some(x => x.userId === alice && x.balance === 1.5),
      'Group creditor balance reflects the attributed repayment');
    assert.ok(groupBalances.json.some(x => x.userId === bob && x.balance === -1.5),
      'Group debtor balance reflects the attributed repayment');

    const deleted = await request('DELETE', `/api/groups/${groupId}`, aliceToken);
    assert.equal(deleted.status, 200, JSON.stringify(deleted));
    const remaining = await db.get('SELECT COUNT(*)::int AS total FROM expenses WHERE group_id = $1', [groupId]);
    assert.equal(remaining.total, 0, 'Group deletion cascades its expense data');
  } finally {
    // The integration database is disposable. Keep cleanup scoped to synthetic fixtures.
    try {
      for (const userId of [...ids].reverse()) {
        await db.run('DELETE FROM notifications WHERE user_id = $1', [userId]);
        await db.run('DELETE FROM contacts WHERE user_id = $1 OR contact_id = $1', [userId]);
        await db.run('DELETE FROM settlements WHERE payer_id = $1 OR payee_id = $1', [userId]);
        await db.run('DELETE FROM group_members WHERE user_id = $1', [userId]);
        await db.run('DELETE FROM users WHERE id = $1', [userId]);
      }
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await db.closeDatabase();
    }
  }
});
