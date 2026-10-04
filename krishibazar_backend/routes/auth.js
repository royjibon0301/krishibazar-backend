const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');
const { sendMail } = require('../utils/mailer');

const emailOk = (e) => typeof e === 'string' && /^\S+@\S+\.\S+$/.test(e);

// POST /auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Naam, email ar password dorkar' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password kompokkhe 6 character hote hobe' });
    if (!emailOk(email))
      return res.status(400).json({ message: 'Email thik nei' });
    if (!['farmer', 'user'].includes(role))
      return res.status(400).json({ message: 'Role farmer ba user hote hobe' });

    const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length) return res.status(409).json({ message: 'Ei email diye account ache' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?,?)',
      [name, email, phone || null, hash, role]
    );
    res.status(201).json({ message: 'Registration shofol. Admin approval-er opekkha korun.' });
  } catch (e) { next(e); }
});

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email ar password din' });

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash)))
      return res.status(401).json({ message: 'Email ba password bhul' });
    if (u.status === 'pending')
      return res.status(403).json({ message: 'Apnar account ekhono admin approve kore ni.' });
    if (u.status === 'rejected')
      return res.status(403).json({ message: 'Apnar account reject kora hoyeche.' });

    const token = jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status },
    });
  } catch (e) { next(e); }
});

// POST /auth/forgot-password   body: { email }
router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim();
    if (!emailOk(email)) return res.status(400).json({ message: 'Valid email din' });

    const generic = { message: 'Email registered thakle 6-digit code pathano hoyeche.' };

    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return res.json(generic); // email ache kina bole dei na

    // 60 second er moddhe abar chaile thamai (spam ruktey)
    const [recent] = await pool.query(
      'SELECT id FROM password_resets WHERE user_id = ? AND created_at > (NOW() - INTERVAL 60 SECOND)',
      [user.id]
    );
    if (recent.length)
      return res.status(429).json({ message: 'Ektu opekkha kore abar try korun (60 second).' });

    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 10);

    await pool.query('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
    const [ins] = await pool.query(
      'INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
      [user.id, codeHash]
    );

    try {
      await sendMail(
        email,
        'KrishiBazar - Password Reset Code',
        `Apnar password reset code: ${code}\n\nEi code 10 minute porjonto kaj korbe. Apni na chaile ei email ignore korun.`
      );
    } catch (mailErr) {
      console.error('Email pathate parini:', mailErr.message);
      await pool.query('DELETE FROM password_resets WHERE id = ?', [ins.insertId]);
      return res.status(500).json({ message: 'Email pathano jayni. Pore abar try korun.' });
    }

    res.json(generic);
  } catch (e) { next(e); }
});

// POST /auth/reset-password   body: { email, code, newPassword }
router.post('/reset-password', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim();
    const code = String(req.body.code || '').trim();
    const newPassword = req.body.newPassword;

    if (!emailOk(email) || !/^\d{6}$/.test(code))
      return res.status(400).json({ message: 'Email ba code thik nei' });
    if (typeof newPassword !== 'string' || newPassword.length < 6)
      return res.status(400).json({ message: 'Password kompokkhe 6 character hote hobe' });

    const bad = { message: 'Code bhul ba meyad shesh hoye gechhe' };

    const [urows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    const user = urows[0];
    if (!user) return res.status(400).json(bad);

    const [rrows] = await pool.query(
      'SELECT * FROM password_resets WHERE user_id = ? AND expires_at > NOW()',
      [user.id]
    );
    const reset = rrows[0];
    if (!reset) return res.status(400).json(bad);

    if (reset.attempts >= 5) {
      await pool.query('DELETE FROM password_resets WHERE id = ?', [reset.id]);
      return res.status(400).json({ message: 'Onek bar bhul code. Notun code nin.' });
    }

    if (!(await bcrypt.compare(code, reset.code_hash))) {
      await pool.query('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', [reset.id]);
      return res.status(400).json(bad);
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
    await pool.query('DELETE FROM password_resets WHERE user_id = ?', [user.id]);

    res.json({ message: 'Password change hoyeche. Ekhon login korun.' });
  } catch (e) { next(e); }
});

module.exports = router;
