/**
 * Put this file at: routes/passwordReset.js   (backend project)
 *
 * 1) Run this SQL once on your Railway MySQL:
 *
 *    CREATE TABLE password_resets (
 *      id INT PRIMARY KEY AUTO_INCREMENT,
 *      email VARCHAR(255) NOT NULL,
 *      code_hash CHAR(64) NOT NULL,
 *      expires_at DATETIME NOT NULL,
 *      attempts INT NOT NULL DEFAULT 0,
 *      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *      INDEX (email)
 *    );
 *
 * 2) In server.js add:
 *      app.use('/auth', require('./routes/passwordReset'));
 *
 * 3) Railway -> Variables:
 *      BREVO_API_KEY = (from Brevo dashboard -> SMTP & API -> API keys)
 *      MAIL_FROM     = (sender email you verified inside Brevo)
 *
 * Assumptions (change if your project differs):
 *   - ../db exports a mysql2/promise pool
 *   - users table is `users` with columns `email` and `password` (bcrypt hash)
 *   - Node 18+ (global fetch)
 */
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool: db } = require('../db');
const router = express.Router();

const hashCode = (code) =>
  crypto.createHash('sha256').update(String(code)).digest('hex');

// Railway Hobby/Free block SMTP, so we send over HTTPS (Brevo API).
async function sendResetEmail(to, code) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'KrishiBazar', email: process.env.MAIL_FROM },
      to: [{ email: to }],
      subject: 'KrishiBazar - পাসওয়ার্ড রিসেট কোড / Password reset code',
      htmlContent: `
        <div style="font-family:Arial,sans-serif">
          <p>আপনার পাসওয়ার্ড রিসেট কোড / Your password reset code:</p>
          <h2 style="letter-spacing:6px">${code}</h2>
          <p>এই কোড ১০ মিনিট পর্যন্ত কাজ করবে। / This code is valid for 10 minutes.</p>
          <p>আপনি না চাইলে এই ইমেইল উপেক্ষা করুন। / If you did not request this, ignore this email.</p>
        </div>`,
    }),
  });
  if (!r.ok) throw new Error(`Email failed: ${r.status} ${await r.text()}`);
}

// POST /auth/forgot-password   { email }
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Same reply whether or not the email exists (don't leak who is registered)
    const generic = {
      message: 'If this email is registered, a code has been sent.',
    };

    const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.json(generic);

    // Throttle: one code per 60 seconds
    const [recent] = await db.query(
      `SELECT id FROM password_resets
       WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)`,
      [email]
    );
    if (recent.length > 0) return res.json(generic);

    const code = String(crypto.randomInt(100000, 1000000)); // 6 digits
    await db.query('DELETE FROM password_resets WHERE email = ?', [email]);
    await db.query(
      `INSERT INTO password_resets (email, code_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [email, hashCode(code)]
    );

    await sendResetEmail(email, code);
    res.json(generic);
  } catch (e) {
    console.error('forgot-password error:', e);
    res.status(500).json({ error: 'Could not send email. Try again later.' });
  }
});

// POST /auth/reset-password   { email, code, newPassword }
router.post('/reset-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.newPassword || '');

    if (!email || code.length !== 6 || newPassword.length < 6) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const [rows] = await db.query(
      'SELECT * FROM password_resets WHERE email = ? AND expires_at > NOW()',
      [email]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }

    const row = rows[0];
    if (row.attempts >= 5) {
      await db.query('DELETE FROM password_resets WHERE id = ?', [row.id]);
      return res
        .status(400)
        .json({ error: 'Too many wrong attempts. Request a new code.' });
    }

    if (row.code_hash !== hashCode(code)) {
      await db.query(
        'UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?',
        [row.id]
      );
      return res.status(400).json({ error: 'Wrong code' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE email = ?', [hashed, email]);
    await db.query('DELETE FROM password_resets WHERE email = ?', [email]);

    res.json({ message: 'Password updated' });
  } catch (e) {
    console.error('reset-password error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
