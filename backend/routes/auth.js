const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomInt, createHash, timingSafeEqual } = require('crypto');
const nodemailer = require('nodemailer');
const { run, get, all, withTransaction } = require('../database');
const authenticate = require('../middleware/auth');

const router = express.Router();

let emailTransporter = null;
function getEmailTransporter() {
  if (emailTransporter) return emailTransporter;
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_USER && SMTP_PASS) {
    emailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
    console.log('[SMTP] Gmail transporter ready');
  } else {
    console.log('[SMTP] No credentials — email verification unavailable');
  }
  return emailTransporter;
}

async function sendEmailOTP(email, code) {
  const transporter = getEmailTransporter();
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Sovereign Expense verification code',
      text: `Your Sovereign Expense verification code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this email.`
    });
    return true;
  } catch (error) {
    console.error('[OTP] Email delivery failed');
    return false;
  }
}

function generateOTP() {
  return String(randomInt(100000, 1000000));
}

function hashOTP(target, purpose, code) {
  return createHash('sha256')
    .update([String(target).trim().toLowerCase(), purpose, String(code), process.env.JWT_SECRET].join(':'))
    .digest('hex');
}

function otpMatches(record, target, purpose, code) {
  const expected = Buffer.from(hashOTP(target, purpose, code), 'hex');
  const actual = /^[a-f0-9]{64}$/.test(record.code) ? Buffer.from(record.code, 'hex') : Buffer.alloc(32);
  return timingSafeEqual(expected, actual);
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function issueOTP(target, purpose) {
  const recipient = target.trim().toLowerCase();
  if (!getEmailTransporter()) {
    const error = new Error('Email verification is not configured'); error.status = 503; throw error;
  }
  const recent = await get(
    "SELECT COUNT(*)::int AS count FROM otps WHERE target = $1 AND purpose = $2 AND created_at > NOW() - INTERVAL '10 minutes'",
    [recipient, purpose]
  );
  if (recent && recent.count >= 3) {
    const error = new Error('Too many requests. Try again later.'); error.status = 429; throw error;
  }
  const code = generateOTP();
  const sent = await sendEmailOTP(recipient, code);
  if (!sent) {
    const error = new Error('Verification email could not be delivered'); error.status = 503; throw error;
  }
  await run('UPDATE otps SET used = 1 WHERE target = $1 AND purpose = $2 AND used = 0', [recipient, purpose]);
  await run('INSERT INTO otps (target, code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
    [recipient, hashOTP(recipient, purpose, code), purpose, new Date(Date.now() + 600000).toISOString()]);
}


router.post('/send-otp', async (req, res) => {
  try {
    const { target, purpose } = req.body || {};
    if (!validEmail(target) || purpose !== 'register') {
      return res.status(400).json({ error: 'Valid email and registration purpose are required' });
    }
    await issueOTP(target, purpose);
    res.json({ message: 'Verification email sent', sent: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed to send verification email' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { target, code, purpose } = req.body || {};
    if (!validEmail(target) || !/^\d{6}$/.test(String(code)) || !['register', 'reset_password'].includes(purpose)) {
      return res.status(400).json({ error: 'Invalid verification request' });
    }
    const recipient = target.trim().toLowerCase();
    const otp = await get(
      'SELECT * FROM otps WHERE target = $1 AND purpose = $2 AND used = 0 ORDER BY id DESC LIMIT 1',
      [recipient, purpose]
    );
    if (!otp || otp.attempts >= 5 || new Date(otp.expires_at) <= new Date()) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    if (!otpMatches(otp, recipient, purpose, code)) {
      await run('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    await run('UPDATE otps SET verified = 1 WHERE id = $1', [otp.id]);
    res.json({ message: 'OTP verified successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, purpose, country_code, country, currency } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || !validEmail(email) || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Name, valid email and password of at least 8 characters are required' });
    }
    const recipient = email.trim().toLowerCase();
    const existing = await get('SELECT id FROM users WHERE email = $1', [recipient]);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    if (phone && await get('SELECT id FROM users WHERE phone = $1', [phone])) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    let userId;
    try {
      userId = await withTransaction(async tx => {
        const otp = await tx.get(
          "SELECT id FROM otps WHERE target = $1 AND purpose = 'register' AND verified = 1 AND used = 0 AND attempts < 5 AND expires_at > NOW() ORDER BY id DESC LIMIT 1 FOR UPDATE",
          [recipient]
        );
        if (!otp) { const err = new Error('Verify your email before registration'); err.status = 403; throw err; }
        const id = await tx.run(
          'INSERT INTO users (name, email, phone, password, purpose, phone_verified, country_code, country, currency) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [name.trim(), recipient, phone || null, hashedPassword, purpose || '', 0, country_code || '+1', country || 'US', currency || 'USD']
        );
        await tx.run('UPDATE otps SET used = 1 WHERE id = $1', [otp.id]);
        return id;
      });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Email or phone already registered' });
      throw error;
    }
    const token = jwt.sign({ id: userId, name: name.trim(), email: recipient }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({
      token,
      user: { id: userId, name: name.trim(), email: recipient, phone: phone || null, purpose: purpose || '', country_code: country_code || '+1', country: country || 'US', currency: currency || 'USD' }
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required' });
    }

    let user;
    if (identifier.includes('@')) {
      user = await get('SELECT * FROM users WHERE email = ?', [identifier]);
    } else {
      user = await get('SELECT * FROM users WHERE phone = ?', [identifier]);
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, purpose: user.purpose, country_code: user.country_code, country: user.country, currency: user.currency }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/check-account', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: 'Email address is required' });
  }

  const user = await get('SELECT id, email, name FROM users WHERE email = ?', [identifier]);

  if (!user) {
    return res.status(404).json({ error: 'No account found with that email' });
  }

  res.json({ methods: [{ type: 'email', target: user.email }], name: user.name });
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { target } = req.body || {};
    if (!validEmail(target)) return res.status(400).json({ error: 'Valid email is required' });
    await issueOTP(target, 'reset_password');
    res.json({ message: 'If the address can receive email, a verification code was sent', sent: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not request password reset' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { identifier, code, newPassword } = req.body || {};
    if (!validEmail(identifier) || !/^\d{6}$/.test(String(code)) || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Valid email, code and password of at least 8 characters are required' });
    }
    const recipient = identifier.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await withTransaction(async tx => {
      const otp = await tx.get(
        "SELECT * FROM otps WHERE target = $1 AND purpose = 'reset_password' AND verified = 1 AND used = 0 AND attempts < 5 AND expires_at > NOW() ORDER BY id DESC LIMIT 1 FOR UPDATE",
        [recipient]
      );
      if (!otp || !otpMatches(otp, recipient, 'reset_password', code)) {
        const err = new Error('Invalid or expired reset code'); err.status = 400; throw err;
      }
      await tx.run('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, recipient]);
      await tx.run('UPDATE otps SET used = 1 WHERE id = $1', [otp.id]);
    });
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Password reset failed' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  const user = await get('SELECT id, name, email, phone, avatar, currency, purpose, phone_verified, country_code, country, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

router.put('/me', authenticate, async (req, res) => {
  const { name, email, phone, currency, country_code, country } = req.body;
  try {
    if (name) await run('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id]);
    if (email) await run('UPDATE users SET email = ? WHERE id = ?', [email, req.user.id]);
    if (phone) await run('UPDATE users SET phone = ? WHERE id = ?', [phone, req.user.id]);
    if (currency) await run('UPDATE users SET currency = ? WHERE id = ?', [currency, req.user.id]);
    if (country_code) await run('UPDATE users SET country_code = ? WHERE id = ?', [country_code, req.user.id]);
    if (country) await run('UPDATE users SET country = ? WHERE id = ?', [country, req.user.id]);

    const user = await get('SELECT id, name, email, phone, avatar, currency, purpose, country_code, country FROM users WHERE id = ?', [req.user.id]);
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// This legacy endpoint previously trusted any supplied UID and email, allowing account takeover.
// Re-enable only after implementing server-side verification of provider-issued identity tokens.
router.post('/social-login', (_req, res) => {
  res.status(501).json({ error: 'Social login is unavailable until identity tokens are verified server-side' });
});

router.get('/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const users = await all('SELECT id, name, email, phone FROM users WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ?) AND id != ? LIMIT 10', [`%${q}%`, `%${q}%`, `%${q}%`, req.user.id]);
  res.json(users);
});

module.exports = router;
