require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, initDb } = require('./db');

(async () => {
  await initDb();
  const email = process.env.ADMIN_EMAIL || 'admin@krishibazar.com';
  const pass = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const hash = await bcrypt.hash(pass, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, status)
     VALUES ('Admin', ?, ?, 'admin', 'approved')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [email, hash]
  );
  console.log('Admin ready:', email);
  process.exit(0);
})();
