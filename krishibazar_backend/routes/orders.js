const router = require('express').Router();
const { pool } = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

const METHODS = ['cod', 'bkash', 'nagad', 'rocket'];

// POST /orders  (buyer)
router.post('/', verifyToken, requireRole('user'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const productId = parseInt(req.body.product_id);
    const qty = parseInt(req.body.quantity);
    const method = String(req.body.payment_method || 'cod').toLowerCase();
    const trx = req.body.transaction_id ? String(req.body.transaction_id).trim() : null;
    const address = String(req.body.delivery_address || '').trim();
    const phone = String(req.body.phone || '').trim();

    if (!productId || !qty || qty < 1)
      return res.status(400).json({ message: 'product_id ar quantity thik moto din' });
    if (!METHODS.includes(method))
      return res.status(400).json({ message: 'Payment method thik nei' });
    if (!address)
      return res.status(400).json({ message: 'Delivery address din' });
    if (!/^01\d{9}$/.test(phone))
      return res.status(400).json({ message: 'Thik phone number din (01XXXXXXXXX)' });
    if (method !== 'cod' && (!trx || trx.length < 6))
      return res.status(400).json({ message: 'Transaction ID din' });

    // Ekoi TrxID dui bar bebohar kora jabe na
    if (method !== 'cod') {
      const [dup] = await pool.query('SELECT id FROM orders WHERE transaction_id = ?', [trx]);
      if (dup.length)
        return res.status(400).json({ message: 'Ei Transaction ID age bebohar hoyeche' });
    }

    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [productId]);
    const p = rows[0];
    if (!p) { await conn.rollback(); return res.status(404).json({ message: 'Product pawa jayni' }); }
    if (p.quantity < qty) { await conn.rollback(); return res.status(400).json({ message: `Stock e matro ${p.quantity} ti ache` }); }

    // COD = delivery te taka; bKash/Nagad/Rocket = admin TrxID verify korbe
    const payStatus = method === 'cod' ? 'unpaid' : 'pending_verification';

    await conn.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [qty, productId]);
    const [r] = await conn.query(
      `INSERT INTO orders
        (user_id, product_id, quantity, total_price,
         payment_method, payment_status, transaction_id, delivery_address, phone)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.id, productId, qty, p.price * qty,
       method, payStatus, method === 'cod' ? null : trx, address, phone]
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
                      o.payment_method, o.payment_status, o.transaction_id,
                      o.delivery_address, o.phone,
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

// PUT/POST /orders/:id/status  { "status": "confirmed" | "cancelled" | "delivered" }
// Farmer (nijer product er order) ba admin. cancelled hole stock ferot jay.
const FLOW = { pending: ['confirmed', 'cancelled'], confirmed: ['delivered', 'cancelled'] };

const updateStatus = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const id = parseInt(req.params.id);
    const to = String(req.body.status || '');
    if (!id || !['confirmed', 'delivered', 'cancelled'].includes(to))
      return res.status(400).json({ message: 'status confirmed, delivered ba cancelled hote hobe' });

    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT o.*, p.farmer_id FROM orders o
       JOIN products p ON p.id = o.product_id WHERE o.id = ? FOR UPDATE`, [id]);
    const o = rows[0];
    if (!o) { await conn.rollback(); return res.status(404).json({ message: 'Order pawa jayni' }); }
    if (req.user.role === 'farmer' && o.farmer_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ message: 'Ei order apnar product er na' });
    }
    if (!(FLOW[o.status] || []).includes(to)) {
      await conn.rollback();
      return res.status(400).json({ message: `${o.status} order ke ${to} kora jabe na` });
    }

    if (to === 'cancelled')
      await conn.query('UPDATE products SET quantity = quantity + ? WHERE id = ?', [o.quantity, o.product_id]);

    // COD order delivered hole taka paoa gelo
    const payStatus = (to === 'delivered' && o.payment_method === 'cod') ? 'paid' : o.payment_status;
    await conn.query('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?', [to, payStatus, id]);

    await conn.commit();
    res.json({ message: `Order ${to}`, status: to });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
};
router.put('/:id/status', verifyToken, requireRole('farmer', 'admin'), updateStatus);
router.post('/:id/status', verifyToken, requireRole('farmer', 'admin'), updateStatus);

module.exports = router;
