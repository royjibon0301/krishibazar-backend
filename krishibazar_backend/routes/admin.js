const router = require('express').Router();
const { pool } = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken, requireRole('admin'));

// GET /admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const [[s]] = await pool.query(`SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'user') AS users,
      (SELECT COUNT(*) FROM users WHERE role = 'farmer') AS farmers,
      (SELECT COUNT(*) FROM products) AS products,
      (SELECT COUNT(*) FROM users WHERE status = 'pending') AS pending`);
    res.json(s);
  } catch (e) { next(e); }
});

// GET /admin/users?status=pending
router.get('/users', async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT id, name, email, phone, role, status, created_at FROM users WHERE role != "admin"';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

const setStatus = (status) => async (req, res, next) => {
  try {
    const [r] = await pool.query('UPDATE users SET status = ? WHERE id = ? AND role != "admin"', [status, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'User pawa jayni' });
    res.json({ message: `User ${status}` });
  } catch (e) { next(e); }
};
router.put('/users/:id/approve', setStatus('approved'));
router.put('/users/:id/reject', setStatus('rejected'));

module.exports = router;
