const { Pool, types } = require('pg');

// PostgreSQL NUMERIC amounts are returned as strings by default. This application
// currently uses number-based arithmetic; constrain stored amounts to 14 digits
// and parse them to maintain the existing JSON API while monetary calculations
// are migrated to integer minor units.
types.setTypeParser(1700, value => Number(value));

let pool = null;

async function initDatabase() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : false
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT NULL,
      currency TEXT DEFAULT 'USD',
      purpose TEXT DEFAULT '',
      phone_verified INTEGER DEFAULT 0,
      country_code TEXT DEFAULT '+1',
      country TEXT DEFAULT 'US',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS otps (
      id SERIAL PRIMARY KEY,
      target TEXT NOT NULL,
      code TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      creator_id INTEGER NOT NULL REFERENCES users(id),
      avatar TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_members (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      paid_by INTEGER NOT NULL REFERENCES users(id),
      description TEXT NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      currency TEXT DEFAULT 'USD',
      category TEXT DEFAULT 'General',
      split_type TEXT DEFAULT 'equal',
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      receipt TEXT DEFAULT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_splits (
      id SERIAL PRIMARY KEY,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount NUMERIC(14,2) NOT NULL,
      is_settled INTEGER DEFAULT 0,
      settled_at TIMESTAMP DEFAULT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settlements (
      id SERIAL PRIMARY KEY,
      payer_id INTEGER NOT NULL REFERENCES users(id),
      payee_id INTEGER NOT NULL REFERENCES users(id),
      amount NUMERIC(14,2) NOT NULL,
      group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      related_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      contact_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, contact_id)
    )
  `);

  console.log('PostgreSQL database initialized');
}

function convertQuery(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

async function run(sql, params = []) {
  const converted = convertQuery(sql);
  const isInsert = /^\s*INSERT/i.test(sql);
  if (isInsert) {
    const result = await pool.query(converted + ' RETURNING id', params);
    return result.rows.length > 0 ? result.rows[0].id : 0;
  }
  await pool.query(converted, params);
  return 0;
}

async function get(sql, params = []) {
  const converted = convertQuery(sql);
  const result = await pool.query(converted, params);
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function all(sql, params = []) {
  const converted = convertQuery(sql);
  const result = await pool.query(converted, params);
  return result.rows;
}

async function withTransaction(work) {
  if (!pool) throw new Error('Database has not been initialized');
  const client = await pool.connect();
  const tx = {
    async run(sql, params = []) {
      const converted = convertQuery(sql);
      const insert = /^\\s*INSERT/i.test(sql);
      const result = await client.query(
        insert ? converted + ' RETURNING id' : converted,
        params
      );
      return insert ? (result.rows[0]?.id || 0) : 0;
    },
    async get(sql, params = []) {
      const result = await client.query(convertQuery(sql), params);
      return result.rows[0] || null;
    },
    async all(sql, params = []) {
      const result = await client.query(convertQuery(sql), params);
      return result.rows;
    }
  };
  try {
    await client.query('BEGIN');
    const result = await work(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { initDatabase, run, get, all, withTransaction };
