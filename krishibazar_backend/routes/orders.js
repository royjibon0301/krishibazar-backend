const router = require('express').Router();
const { pool } = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

// POST /orders  (buyer)
router.post('/', verifyToken, requireRole('user'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const productId = parseInt(req.body.product_id);
    const qty = parseInt(req.body.quantity);
    if (!productId || !qty || qty < 1)
      return res.status(400).json({ message: 'product_id ar quantity thik moto din' });

    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [productId]);
    const p = rows[0];
    if (!p) { await conn.rollback(); return res.status(404).json({ message: 'Product pawa jayni' }); }
    if (p.quantity < qty) { await conn.rollback(); return res.status(400).json({ message: `Stock e matro ${p.quantity} ti ache` }); }

    await conn.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [qty, productId]);
    const [r] = await conn.query(
      'INSERT INTO orders (user_id, product_id, quantity, total_price) VALUES (?,?,?,?)',
      [req.user.id, productId, qty, p.price * qty]
    );
    await conn.commit();
    res.status(201).json({ id: r.insertId, message: 'Order shofol hoyeche' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

// GET /orders  (user: nijer, farmer: nijer product-er, admin: shob)
router.get('/', verifyToken, async (req, res, next) => {
  try {
    let sql = `SELECT o.id, o.quantity, o.total_price, o.status, o.created_at,
                      p.name AS product_name, u.name AS buyer_name
               FROM orders o
               JOIN products p ON p.id = o.product_id
               JOIN users u ON u.id = o.user_id`;
    const params = [];
    if (req.user.role === 'user') { sql += ' WHERE o.user_id = ?'; params.push(req.user.id); }
    else if (req.user.role === 'farmer') { sql += ' WHERE p.farmer_id = ?'; params.push(req.user.id); }
    sql += ' ORDER BY o.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
