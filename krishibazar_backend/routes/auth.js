const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

// POST /auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Naam, email ar password dorkar' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password kompokkhe 6 character hote hobe' });
    if (!/^\S+@\S+\.\S+$/.test(email))
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

module.exports = router;
