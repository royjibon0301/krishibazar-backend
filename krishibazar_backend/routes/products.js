const router = require('express').Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { pool } = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Shudhu image file dewa jabe')),
});

const uploadToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: 'krishibazar' }, (err, result) => (err ? reject(err) : resolve(result)))
      .end(buffer);
  });

// GET /products?search=
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    let sql = `SELECT p.*, u.name AS farmer_name
               FROM products p JOIN users u ON u.id = p.farmer_id`;
    const params = [];
    if (search) {
      sql += ' WHERE p.name LIKE ? OR p.description LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY p.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /products  (farmer only, multipart)
router.post('/', verifyToken, requireRole('farmer'), upload.single('image'), async (req, res, next) => {
  try {
    const { name, description, price, quantity } = req.body;
    if (!name || isNaN(price) || isNaN(quantity) || Number(price) <= 0 || Number(quantity) < 0)
      return res.status(400).json({ message: 'Naam, price ar quantity thik moto din' });

    let imageUrl = null;
    if (req.file) imageUrl = (await uploadToCloudinary(req.file.buffer)).secure_url;

    const [r] = await pool.query(
      'INSERT INTO products (farmer_id, name, description, price, quantity, image_url) VALUES (?,?,?,?,?,?)',
      [req.user.id, name, description || null, price, quantity, imageUrl]
    );
    res.status(201).json({ id: r.insertId, message: 'Product add hoyeche', image_url: imageUrl });
  } catch (e) { next(e); }
});

module.exports = router;
