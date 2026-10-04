require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'KrishiBazar API running' }));
app.use('/auth', require('./routes/auth'));
app.use('/products', require('./routes/products'));
app.use('/orders', require('./routes/orders'));
app.use('/admin', require('./routes/admin'));

// 404
app.use((req, res) => res.status(404).json({ message: 'Route pawa jayni' }));

// Global error handler (server crash hobe na)
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === 'Shudhu image file dewa jabe') return res.status(400).json({ message: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Image 5MB er beshi hobe na' });
  res.status(500).json({ message: 'Server e somoshya hoyeche' });
});

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => app.listen(PORT, () => console.log(`Server running on ${PORT}`)))
  .catch((e) => { console.error('DB init failed:', e.message); process.exit(1); });
