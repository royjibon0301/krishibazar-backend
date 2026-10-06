const router = require('express').Router();
const { pool } = require('../db');
const { verifyToken } = require('../middleware/auth');

// GET /market-prices
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, name_bn, price FROM market_prices ORDER BY name');
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
